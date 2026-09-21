#!/usr/bin/env python3
"""Paired web/API/schema upgrade; public writes stay closed until checks pass.

This command touches only Pirata service, paths and the imported Pirata Caddy
snippet. Automatic DB rollback is permitted only before the new site is opened.
Previous releases, configurations and pre-migration DB/files remain private.
"""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import sqlite3
import stat
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from backup import Paths, backup_once, restore_bundle, verify_private_copy
from release import inspect_dist, publish, switch as switch_web

SOURCE = Path(__file__).resolve().parent
ROOT = Path('/srv/pirata')
BACKUPS = Path('/var/backups/pirata')
STATE = Path('/var/lib/pirata')
SITE = Path('/etc/caddy/pirata.caddy')
UNIT = Path('/etc/systemd/system/pirata-api.service')


def run(args):
    result = subprocess.run(list(map(str, args)), stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('Scoped operation failed: ' + str(args[0]))


def status(url, method='GET'):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method=method), timeout=8) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def reload_caddy():
    run(['caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    run(['systemctl', 'reload', 'caddy'])


def atomic_write(path, data, mode=0o644):
    temporary = path.parent / ('.' + path.name + '-' + uuid.uuid4().hex)
    try:
        with temporary.open('xb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        temporary.chmod(mode)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def switch_api(release):
    temporary = ROOT / ('.api-' + uuid.uuid4().hex)
    temporary.symlink_to('api-releases/' + release.name)
    os.replace(temporary, ROOT / 'api-current')


def migration_hashes(release):
    directory = release / 'src/db/migrations'
    files = sorted(directory.glob('*.sql'))
    if not files or any(not re.fullmatch(r'\d{3}-.+\.sql', p.name) for p in files):
        raise ValueError('Invalid migration file layout')
    if [int(p.name[:3]) for p in files] != list(range(1, len(files) + 1)):
        raise ValueError('Migrations must be contiguous')
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


def validate_migration_history(previous, candidate):
    old, new = migration_hashes(previous), migration_hashes(candidate)
    if any(new.get(name) != digest for name, digest in old.items()):
        raise ValueError('Applied migration files must remain unchanged')
    return new


def verify_preserved(before, after):
    """Every historical value must survive, including original namespace/IDs."""
    counts = {}
    with sqlite3.connect(before.as_uri() + '?mode=ro&immutable=1', uri=True) as old, \
            sqlite3.connect(after.as_uri() + '?mode=ro&immutable=1', uri=True) as new:
        for (table,) in old.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='schema_versions'"):
            if not re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]*', table):
                raise ValueError('Unexpected historical table')
            columns = [row[1] for row in old.execute(f'PRAGMA table_info("{table}")')]
            selection = ','.join('"' + name.replace('"', '""') + '"' for name in columns)
            old_rows = sorted(json.dumps(row) for row in old.execute(f'SELECT {selection} FROM "{table}"'))
            new_rows = sorted(json.dumps(row) for row in new.execute(f'SELECT {selection} FROM "{table}"'))
            if old_rows != new_rows:
                raise ValueError('Migration changed historical records in ' + table)
            counts[table] = len(old_rows)
    verify_private_copy(after)
    return counts


def validate_candidate(candidate):
    if candidate.parent != Path('/tmp') or not candidate.name.startswith('pirata-server-candidate-') or candidate.is_symlink():
        raise ValueError('Expected a sealed candidate under /tmp')
    for required in ['dist/main.js', 'dist/cli.js', 'src/db/migrations']:
        if not (candidate / required).exists():
            raise ValueError('Missing candidate input')
    for path in candidate.rglob('*'):
        if path.is_symlink():
            if path.readlink().is_absolute() or not path.resolve(strict=True).is_relative_to(candidate):
                raise ValueError('Candidate link escapes package')
        elif not path.is_dir() and not path.is_file():
            raise ValueError('Unexpected candidate file type')
        if path.name.startswith('.env') or path.suffix in ('.sqlite', '.db'):
            raise ValueError('Private data in candidate')


def health_and_protection():
    for _ in range(30):
        try:
            if status('http://127.0.0.1:3001/api/v1/health') == 200:
                break
        except OSError:
            pass
        time.sleep(.3)
    else:
        raise ValueError('API did not become healthy')
    # Exact file routes are exercised by API/browser tests; an unknown private
    # file still must authenticate before revealing record existence.
    for route, method in [('/api/v1/snapshot', 'GET'), ('/api/v1/export', 'GET'),
                          ('/api/v1/files/00000000-0000-4000-8000-000000000000/content', 'GET'),
                          ('/api/v1/commands', 'POST')]:
        if status('http://127.0.0.1:3001' + route, method) != 401:
            raise ValueError('Anonymous business API was not protected')


def move_database(source, destination):
    """API must be stopped; retain all WAL-related files together."""
    for suffix in ('', '-wal', '-shm', '-journal'):
        path = Path(str(source) + suffix)
        if path.exists():
            target = Path(str(destination) + suffix)
            if target.exists() or target.is_symlink():
                raise ValueError('Recovery path already exists')
            os.rename(path, target)


def publish_team(candidate, dist):
    if os.geteuid() != 0 or socket.gethostname() != 'srv1972305':
        raise ValueError('Requires scoped root on the verified VPS')
    os.umask(0o077)
    candidate, dist = candidate.absolute(), dist.absolute()
    validate_candidate(candidate)
    inspect_dist(dist)
    previous = (ROOT / 'api-current').resolve(strict=True)
    previous_web = (ROOT / 'current').resolve(strict=True).name
    if previous.parent != ROOT / 'api-releases':
        raise ValueError('Unexpected previous API location')
    migrations = validate_migration_history(previous, candidate)
    if status('https://research.andresinbox.tech/') != 401:
        raise ValueError('Unrelated Research baseline differs; inspect first')
    token = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    record = BACKUPS / ('team-upgrade-' + token)
    record.mkdir(mode=0o700)
    for path in [SITE, UNIT, Path('/etc/caddy/Caddyfile'), ROOT / 'operations/backup.py']:
        if path.is_symlink():
            raise ValueError('Unexpected configuration symlink')
        shutil.copyfile(path, record / path.name)
        (record / path.name).chmod(0o600)
    if Path('/etc/caddy/pirata-access.caddy').is_file():
        shutil.copyfile('/etc/caddy/pirata-access.caddy', record / 'pirata-access.caddy')
        (record / 'pirata-access.caddy').chmod(0o600)
    release = ROOT / 'api-releases' / token
    shutil.copytree(candidate, release, symlinks=True)
    for path in [release, *release.rglob('*')]:
        if path.is_symlink():
            if not path.resolve(strict=True).is_relative_to(release):
                raise ValueError('Relocated package link escapes release')
        else:
            path.chmod(0o755 if path.is_dir() or path.stat().st_mode & stat.S_IXUSR else 0o644)
    report = {'apiReleaseId': token, 'previousApiReleaseId': previous.name,
              'previousWebReleaseId': previous_web, 'migrationChecksums': migrations,
              'status': 'staged', 'record': str(record),
              'apiFiles': {str(p.relative_to(release)): hashlib.sha256(p.read_bytes()).hexdigest()
                           for p in release.rglob('*') if p.is_file() and not p.is_symlink()}}
    report_path = record / 'upgrade.json'
    def save():
        atomic_write(report_path, (json.dumps(report, indent=2) + '\n').encode(), 0o600)
    save()
    closed = stopped = replaced = opened = False
    owner = pwd.getpwnam('pirata')
    recovery = STATE / ('upgrade-recovery-' + token)
    recovery.mkdir(mode=0o700)
    try:
        atomic_write(SITE, b'pirata.andresinbox.tech {\n header Retry-After 120\n respond "Pirata is updating. Please try again shortly." 503\n}\n')
        closed = True
        reload_caddy()
        if status('https://pirata.andresinbox.tech/') != 503:
            raise ValueError('Maintenance route did not close public access')
        run(['systemctl', 'stop', 'pirata-api.service'])
        stopped = True
        paths = Paths(cli=previous / 'dist/cli.js')
        database, _ = backup_once(paths, owner.pw_uid, owner.pw_gid)
        report['preMigrationBackup'] = str(database)
        def migrate(source, target):
            run([ROOT / 'runtime/node', release / 'dist/cli.js', 'restore', source, target])
        scratch = record / 'migrated-scratch'
        restore_bundle(database, scratch, migrate)
        report['preservedRecords'] = verify_preserved(database, scratch / 'pirata.sqlite')
        report['scratchRestore'] = str(scratch)
        save()
        incoming = STATE / ('.incoming-' + token + '.sqlite')
        shutil.copyfile(scratch / 'pirata.sqlite', incoming)
        incoming.chmod(0o600)
        os.chown(incoming, owner.pw_uid, owner.pw_gid)
        move_database(STATE / 'pirata.sqlite', recovery / 'previous.sqlite')
        replaced = True
        os.replace(incoming, STATE / 'pirata.sqlite')
        switch_api(release)
        atomic_write(ROOT / 'operations/backup.py', (SOURCE / 'backup.py').read_bytes())
        atomic_write(UNIT, (SOURCE / 'pirata-api.service').read_bytes())
        run(['systemd-analyze', 'verify', UNIT])
        run(['systemctl', 'daemon-reload'])
        run(['systemctl', 'start', 'pirata-api.service'])
        health_and_protection()
        web = publish(dist, ROOT, BACKUPS)
        report['webReleaseId'] = web['releaseId']
        report['status'] = 'verified-before-public-open'
        save()
        atomic_write(SITE, (SOURCE / 'Caddyfile.team.example').read_bytes())
        # Once reload is attempted, assume public writes could have arrived even
        # if a subsequent command/report fails. Do not restore an old DB then.
        run(['caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
        opened = True
        run(['systemctl', 'reload', 'caddy'])
        if status('https://pirata.andresinbox.tech/') != 200 or status('https://pirata.andresinbox.tech/api/v1/snapshot') != 401:
            raise ValueError('Public app/authentication check failed')
        if status('https://research.andresinbox.tech/') != 401:
            raise ValueError('Research baseline changed')
        run(['systemctl', 'start', 'pirata-backup.service'])
        report['status'] = 'live; authenticated browser verification still required'
        save()
        print(json.dumps({key: value for key, value in report.items() if key != 'apiFiles'}))
    except BaseException:
        if opened:
            report['status'] = 'opened-needs-review; preserve new writes; no automatic database rollback'
            save()
            raise
        if stopped:
            run(['systemctl', 'stop', 'pirata-api.service'])
        if replaced:
            move_database(STATE / 'pirata.sqlite', recovery / 'failed-candidate.sqlite')
            move_database(recovery / 'previous.sqlite', STATE / 'pirata.sqlite')
        switch_api(previous)
        switch_web(ROOT, previous_web)
        atomic_write(UNIT, (record / UNIT.name).read_bytes())
        atomic_write(ROOT / 'operations/backup.py', (record / 'backup.py').read_bytes())
        run(['systemctl', 'daemon-reload'])
        if stopped:
            run(['systemctl', 'start', 'pirata-api.service'])
        if closed:
            atomic_write(SITE, (record / SITE.name).read_bytes())
            reload_caddy()
        report['status'] = 'rolled-back-before-public-open; previous database/releases/configuration restored'
        save()
        raise


def main(candidate, dist):
    if os.geteuid() != 0 or socket.gethostname() != 'srv1972305':
        raise ValueError('Requires scoped root on the verified VPS')
    descriptor = os.open(BACKUPS / 'release.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        publish_team(candidate, dist)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate', type=Path)
    parser.add_argument('--dist', type=Path, default=SOURCE.parent / 'dist')
    arguments = parser.parse_args()
    main(arguments.candidate, arguments.dist)

#!/usr/bin/env python3
"""Noninterrupting candidate migration check against an existing complete backup."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import socket
import uuid
from backup import restore_bundle


def main(candidate, database):
    if os.geteuid() != 0 or socket.gethostname() != 'srv1972305':
        raise ValueError('Requires scoped root on the verified VPS')
    os.umask(0o077)
    helpers = runpy.run_path(str(Path(__file__).with_name('publish-team.py')))
    candidate, database = candidate.absolute(), database.absolute()
    helpers['validate_candidate'](candidate)
    migrations = helpers['validate_migration_history'](Path('/srv/pirata/api-current').resolve(), candidate)
    if database.parent != Path('/var/backups/pirata/database') or database.is_symlink():
        raise ValueError('Use an existing private production backup')
    token = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    record = Path('/var/backups/pirata') / ('team-preflight-' + token)
    record.mkdir(mode=0o700)
    for source in ['/etc/caddy/Caddyfile', '/etc/caddy/pirata.caddy', '/etc/caddy/pirata-access.caddy',
                   '/etc/systemd/system/pirata-api.service', '/srv/pirata/operations/backup.py']:
        path = Path(source)
        if path.is_symlink():
            raise ValueError('Unexpected configuration link')
        shutil.copyfile(path, record / path.name)
        (record / path.name).chmod(0o600)
    def migrate(source, target):
        helpers['run'](['/srv/pirata/runtime/node', candidate / 'dist/cli.js', 'restore', source, target])
    restored = record / 'migrated-scratch'
    bundle = restore_bundle(database, restored, migrate)
    preserved = helpers['verify_preserved'](database, restored / 'pirata.sqlite')
    result = {'status': 'candidate migration and files verified; live data/services unchanged',
              'candidate': str(candidate), 'record': str(record), 'databaseBackup': str(database),
              'databaseBackupSha256': hashlib.sha256(database.read_bytes()).hexdigest(),
              'migrationChecksums': migrations, 'preservedRecords': preserved,
              'restoredFiles': len(bundle['files']), 'scratch': str(restored)}
    (record / 'preflight.json').write_text(json.dumps(result, indent=2) + '\n')
    (record / 'preflight.json').chmod(0o600)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate', type=Path)
    parser.add_argument('database', type=Path)
    args = parser.parse_args()
    main(args.candidate, args.database)

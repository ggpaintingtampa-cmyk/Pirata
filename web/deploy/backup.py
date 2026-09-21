#!/usr/bin/env python3
"""Owner-run SQLite backup, followed by private root verification and publication.

The application CLI alone opens the live DB, as pirata. Root verifies an isolated
copy using immutable=1; that flag is never used on the live or staging database.
No automatic retention deletion is performed.
"""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import sqlite3
import stat
import subprocess
import sys
import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class Paths:
    state: Path = Path('/var/lib/pirata')
    backups: Path = Path('/var/backups/pirata')
    node: Path = Path('/srv/pirata/runtime/node')
    cli: Path = Path('/srv/pirata/api-current/dist/cli.js')

    @property
    def uploads(self):
        return self.state / 'uploads'


def private_directory(path, uid, gid=None, create=False):
    if not path.is_absolute() or path.resolve() != path:
        raise ValueError('Private directory must not contain symlinks')
    if create:
        try:
            path.mkdir(mode=0o700)
        except FileExistsError:
            pass
        else:
            os.chown(path, uid, gid if gid is not None else -1)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
        raise ValueError('Unexpected private directory ownership or permissions')


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def backup_as_owner(paths, destination):
    # Dropping identity before SQLite opens the source also covers creation of
    # WAL/SHM files when the API is stopped. Do not run this CLI as root.
    completed = subprocess.run([
        '/usr/sbin/runuser', '-u', 'pirata', '--', '/usr/bin/env', '-i',
        'PATH=/usr/bin:/bin', 'NODE_ENV=production',
        'PIRATA_DB_PATH=' + str(paths.state / 'pirata.sqlite'),
        'PIRATA_ORIGIN=https://pirata.andresinbox.tech',
        str(paths.node), str(paths.cli), 'backup', str(destination),
    ], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
       stderr=subprocess.PIPE, check=False)
    if completed.returncode:
        # Never print private SQLite contents or subprocess output to journald.
        raise RuntimeError('Application backup command failed')


def verify_private_copy(path):
    # This file has just been copied into a coordinator-only directory; no
    # application process can change it. Ignoring WAL here is therefore safe.
    db = sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True)
    try:
        if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('Backup integrity failed')
        if db.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('Backup relationships failed')
    finally:
        db.close()


def publish_verified(staged, directory, owner_uid, token):
    # A successful, exited CLI must leave a complete standalone database.
    # Refuse any sidecar that could contain pages missing from the main file.
    for suffix in ('-wal', '-journal'):
        sidecar = Path(str(staged) + suffix)
        if sidecar.exists() or sidecar.is_symlink():
            info = sidecar.lstat()
            if (not stat.S_ISREG(info.st_mode) or info.st_size != 0
                    or info.st_uid != owner_uid or info.st_nlink != 1):
                raise ValueError('Backup has an unexpected journal sidecar')
    pending = directory / ('.pending-' + token + '.sqlite')
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    final = directory / (timestamp + '-' + token + '.sqlite')
    source_fd = os.open(staged, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(source_fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != owner_uid
                or before.st_mode & 0o077 or before.st_nlink != 1):
            raise ValueError('Unexpected staged backup file')
        dest_fd = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        digest = hashlib.sha256()
        try:
            with os.fdopen(dest_fd, 'wb') as output:
                while chunk := os.read(source_fd, 1024 * 1024):
                    output.write(chunk)
                    digest.update(chunk)
                output.flush()
                os.fsync(output.fileno())
            after = os.fstat(source_fd)
            if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                raise ValueError('Staged backup changed while being copied')
            verify_private_copy(pending)
            if final.exists() or final.is_symlink():
                raise ValueError('Backup destination already exists')
            # Caller holds the root-only publication lock. The rename is within
            # one directory/filesystem and exposes only the verified full file.
            os.rename(pending, final)
            sync_directory(directory)
            return final, digest.hexdigest()
        finally:
            pending.unlink(missing_ok=True)
    finally:
        os.close(source_fd)


def copy_private_file(source, target, expected_uid=None, max_bytes=None):
    """Copy immutable upload bytes without following links or trusting filenames."""
    source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(source_fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
                or before.st_mode & 0o077 or (max_bytes is not None and before.st_size > max_bytes)
                or (expected_uid is not None and before.st_uid != expected_uid)):
            raise ValueError('Unexpected private upload file')
        dest_fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        digest = hashlib.sha256()
        with os.fdopen(dest_fd, 'wb') as output:
            while chunk := os.read(source_fd, 1024 * 1024):
                digest.update(chunk)
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        after = os.fstat(source_fd)
        if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise ValueError('Upload changed during backup')
        return {'sha256': digest.hexdigest(), 'bytes': before.st_size}
    finally:
        os.close(source_fd)


def bundle_paths(database):
    return database.with_suffix('.files'), database.with_suffix('.manifest.json')


def publish_files(paths, database, digest, owner_uid):
    """DB-first snapshot is consistent because uploaded binaries are immutable.

    The upload handler must rename complete bytes into storage before committing
    its DB row. Recoverable deletion retains bytes. Only paths referenced by the
    snapshot are copied; unfinished uploads are ignored. A manifest is the completion
    marker; a DB without one is not a complete DB+files backup.
    """
    files, manifest = bundle_paths(database)
    pending = files.parent / ('.pending-' + files.name)
    pending.mkdir(mode=0o700)
    entries = {}
    try:
        with sqlite3.connect(database.as_uri() + '?mode=ro&immutable=1', uri=True) as db:
            has_attachments = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='attachments'").fetchone()
            keys = set()
            if has_attachments:
                for row in db.execute('SELECT storage_key, preview_key FROM attachments'):
                    keys.update(key for key in row if key)
        if keys or paths.uploads.exists() or paths.uploads.is_symlink():
            private_directory(paths.uploads, owner_uid)
            for key in sorted(keys):
                relative = Path(key)
                if relative.is_absolute() or not relative.parts or any(p in ('.', '..') for p in relative.parts):
                    raise ValueError('Invalid stored upload path')
                source = paths.uploads / relative
                if source.resolve() != source:
                    raise ValueError('Upload path cannot contain links')
                for directory in [source.parent, *source.parent.parents]:
                    if directory == paths.uploads.parent:
                        break
                    private_directory(directory, owner_uid)
                (pending / relative).parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                entries[relative.as_posix()] = copy_private_file(source, pending / relative, owner_uid, 128 * 1024 * 1024)
        os.rename(pending, files)
        record = {'format': 'pirata-private-backup-v1', 'database': database.name,
                  'databaseSha256': digest, 'filesDirectory': files.name, 'files': entries}
        fd = os.open(manifest, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(record, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        sync_directory(files)
        sync_directory(files.parent)
    except BaseException:
        shutil.rmtree(pending, ignore_errors=True)
        shutil.rmtree(files, ignore_errors=True)
        manifest.unlink(missing_ok=True)
        raise


def restore_bundle(database, destination, restore_runner=None):
    """Verify and restore DB+files only into a previously unused scratch directory."""
    database, destination = Path(database).absolute(), Path(destination).absolute()
    files, manifest = bundle_paths(database)
    if database.resolve() != database or files.resolve() != files or manifest.is_symlink():
        raise ValueError('Backup paths cannot contain links')
    if destination.exists() or destination.is_symlink() or destination.parent.resolve() != destination.parent:
        raise ValueError('Restore requires a new scratch directory without linked ancestors')
    record = json.loads(manifest.read_text())
    if (record.get('format') != 'pirata-private-backup-v1' or record.get('database') != database.name
            or record.get('filesDirectory') != files.name
            or hashlib.sha256(database.read_bytes()).hexdigest() != record.get('databaseSha256')):
        raise ValueError('Backup manifest/database mismatch')
    verify_private_copy(database)
    destination.mkdir(mode=0o700)
    try:
        uploads = destination / 'uploads'
        uploads.mkdir(mode=0o700)
        for name, expected in record['files'].items():
            relative = Path(name)
            if relative.is_absolute() or not relative.parts or any(p in ('.', '..') for p in relative.parts):
                raise ValueError('Invalid upload name in backup manifest')
            source, target = files / relative, uploads / relative
            if source.resolve() != source:
                raise ValueError('Backup upload cannot contain links')
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if copy_private_file(source, target, max_bytes=128 * 1024 * 1024) != expected:
                raise ValueError('Backup upload checksum differs')
        if restore_runner:
            restore_runner(database, destination / 'pirata.sqlite')
        else:
            copy_private_file(database, destination / 'pirata.sqlite')
        verify_private_copy(destination / 'pirata.sqlite')
        return record
    except BaseException:
        shutil.rmtree(destination)
        raise


def backup_once(paths, owner_uid, owner_gid, runner=backup_as_owner):
    coordinator_uid = os.geteuid()
    private_directory(paths.state, owner_uid)
    database = paths.state / 'pirata.sqlite'
    info = database.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != owner_uid or info.st_mode & 0o077:
        raise ValueError('Unexpected live database ownership or permissions')
    private_directory(paths.backups, coordinator_uid)
    directory = paths.backups / 'database'
    private_directory(directory, coordinator_uid, create=True)
    staging = paths.state / 'backup-staging'
    private_directory(staging, owner_uid, owner_gid, create=True)
    lock_fd = os.open(paths.backups / 'database-backup.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        lock_info = os.fstat(lock_fd)
        if (not stat.S_ISREG(lock_info.st_mode) or lock_info.st_uid != coordinator_uid
                or lock_info.st_mode & 0o077 or lock_info.st_nlink != 1):
            raise ValueError('Unexpected backup lock')
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        token = uuid.uuid4().hex
        work = staging / token
        work.mkdir(mode=0o700)
        os.chown(work, owner_uid, owner_gid)
        try:
            staged = work / 'snapshot.sqlite'
            runner(paths, staged)
            final, digest = publish_verified(staged, directory, owner_uid, token)
            try:
                publish_files(paths, final, digest, owner_uid)
            except BaseException:
                final.unlink(missing_ok=True)
                raise
            return final, digest
        finally:
            shutil.rmtree(work)
    finally:
        os.close(lock_fd)


def main():
    os.umask(0o077)
    if os.geteuid() != 0:
        raise ValueError('Use the scoped root backup service')
    owner = pwd.getpwnam('pirata')
    path, digest = backup_once(Paths(), owner.pw_uid, owner.pw_gid)
    print('Private database and uploads backup verified:', path.name, 'sha256=' + digest)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # systemd records failure; keep DB values and subprocess output private.
        sys.exit('Pirata backup failed; no unverified backup was published.')

#!/usr/bin/env python3
"""Publish reviewed static assets. No DNS, firewall or service changes."""
import argparse
import fcntl
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import stat
import sys
from datetime import datetime, timezone
from uuid import uuid4

DEFAULT_DIST = Path('/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web/dist')
PRODUCTION = Path('/srv/pirata')
BACKUPS = Path('/var/backups/pirata')
ASSET = re.compile(r'assets/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{6,}\.(?:js|css|svg|png|jpg|jpeg|webp|woff2)\Z')
RELEASE = re.compile(r'\d{8}T\d{6}Z-[a-f0-9]{8}\Z')
LIMIT = 64 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def regular_bytes(path):
    require(stat.S_ISREG(path.lstat().st_mode), f'Not a regular file: {path}')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        details = os.fstat(descriptor)
        require(stat.S_ISREG(details.st_mode), f'Not a regular file: {path}')
        require(details.st_size <= LIMIT, f'File too large: {path}')
        with os.fdopen(descriptor, 'rb', closefd=False) as source:
            data = source.read(LIMIT + 1)
        require(len(data) <= LIMIT, f'File too large: {path}')
        return data
    finally:
        os.close(descriptor)


def safe_directory(path, private=False):
    """All existing path components must be real directories owned by this UID."""
    if not path.exists():
        safe_directory(path.parent)
        path.mkdir(mode=0o700 if private else 0o755)
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode), f'Expected a directory, not a link: {path}')
    require(info.st_uid == os.geteuid(), f'Unexpected directory owner: {path}')
    require(not info.st_mode & 0o022, f'Writable by group/others: {path}')
    if private:
        path.chmod(0o700)


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        fields = dict(attributes)
        require(not any(key.startswith('on') for key in fields), 'Inline HTML event handler')
        if tag == 'script':
            require(bool(fields.get('src')), 'Inline script is not permitted')
        for key in ('src', 'href'):
            if fields.get(key):
                self.urls.append(fields[key])


def inspect_dist(source):
    require(source.is_absolute(), 'Use an absolute dist path')
    require(source.resolve() == source, 'Source path must not contain symlinks')
    require(source.is_dir(), f'Missing dist directory: {source}')
    files = {}
    for path in sorted(source.rglob('*')):
        require(not path.is_symlink(), f'Symlink rejected: {path}')
        name = path.relative_to(source).as_posix()
        if path.is_dir():
            require(name == 'assets', f'Unexpected directory: {name}')
            continue
        require(name in ('index.html', 'favicon.svg') or ASSET.fullmatch(name),
                f'Unexpected build file: {name}')
        files[name] = regular_bytes(path)
    require('index.html' in files and 'favicon.svg' in files, 'Missing entrypoint/favicon')
    require(any(name.endswith('.js') for name in files), 'Missing JavaScript asset')
    require(any(name.endswith('.css') for name in files), 'Missing CSS asset')
    require(sum(map(len, files.values())) <= LIMIT, 'Build exceeds 64 MiB review limit')
    html = files['index.html'].decode('utf-8')
    require('Morgan el Pirata' in html, 'Unexpected application title')
    parser = References()
    parser.feed(html)
    for url in parser.urls:
        normalized = url[2:] if url.startswith('./') else url.lstrip('/')
        require(normalized in files, f'Missing or external entrypoint reference: {url}')
    return files


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_new(path, data, mode):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    path.chmod(mode)


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def current_release(root):
    current = root / 'current'
    if not current.exists() and not current.is_symlink():
        return None
    require(current.is_symlink(), 'current must be a release symlink')
    target = current.resolve(strict=True)
    require(target.parent == root / 'releases' and RELEASE.fullmatch(target.name),
            'current points outside releases')
    return target.name


def switch(root, release_id):
    temporary = root / ('.current-' + uuid4().hex)
    temporary.symlink_to('releases/' + release_id)
    os.replace(temporary, root / 'current')
    sync_directory(root)


def publish(source, root, backups):
    files = inspect_dist(source)
    previous = current_release(root)
    release_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid4().hex[:8]
    release = root / 'releases' / release_id
    shared = root / 'shared'
    # Check all immutable asset collisions before changing any release pointer.
    for name, content in files.items():
        if name.startswith('assets/'):
            target = shared / name
            require(not target.is_symlink(), f'Asset symlink rejected: {target}')
            if target.exists():
                require(regular_bytes(target) == content, f'Immutable asset collision: {name}')
    release.mkdir(mode=0o755)
    release.chmod(0o755)
    (release / 'assets').mkdir(mode=0o755)
    (release / 'assets').chmod(0o755)
    for name, content in files.items():
        write_new(release / name, content, 0o644)
        if name.startswith('assets/') and not (shared / name).exists():
            write_new(shared / name, content, 0o644)
    manifest = {
        'releaseId': release_id, 'previousRelease': previous,
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'files': {name: digest(data) for name, data in files.items()},
    }
    write_new(backups / (release_id + '.json'),
              (json.dumps(manifest, indent=2) + '\n').encode(), 0o600)
    for directory in [release / 'assets', release, root / 'releases', shared / 'assets', backups]:
        sync_directory(directory)
    # Verify the complete release and shared copies before the atomic switch.
    verify_release(root, backups, release_id)
    switch(root, release_id)
    return manifest


def verify_release(root, backups, release_id):
    require(bool(RELEASE.fullmatch(release_id)), 'Invalid release ID')
    release = root / 'releases' / release_id
    require(not release.is_symlink(), 'Release directory cannot be a symlink')
    manifest = json.loads(regular_bytes(backups / (release_id + '.json')))
    files = inspect_dist(release)
    require(manifest['releaseId'] == release_id, 'Manifest release mismatch')
    require({name: digest(data) for name, data in files.items()} == manifest['files'],
            'Release checksums differ from saved manifest')
    for name, data in files.items():
        if name.startswith('assets/'):
            require(regular_bytes(root / 'shared' / name) == data, 'Shared asset mismatch')
    return manifest


def rollback(root, backups, release_id):
    manifest = verify_release(root, backups, release_id)
    previous = current_release(root)
    record_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid4().hex[:8]
    write_new(backups / ('rollback-' + record_id + '.json'),
              json.dumps({'from': previous, 'to': release_id}).encode(), 0o600)
    switch(root, release_id)
    return manifest


def prepare(root, backups):
    # Production parents are fixed, root-owned directories, never arbitrary input.
    for path in [root, root / 'releases', root / 'shared', root / 'shared' / 'assets']:
        safe_directory(path)
    safe_directory(backups, private=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    for name in ('inspect', 'publish'):
        command = commands.add_parser(name)
        command.add_argument('--dist', type=Path, default=DEFAULT_DIST)
    command = commands.add_parser('rollback')
    command.add_argument('release_id')
    args = parser.parse_args()
    if args.action == 'inspect':
        files = inspect_dist(args.dist)
        print(json.dumps({name: digest(data) for name, data in files.items()}, indent=2))
        return
    require(os.geteuid() == 0, 'Production publishing requires a scoped privileged invocation')
    # Reject symlink ancestors before touching production paths.
    for path in [Path('/srv'), Path('/var'), Path('/var/backups')]:
        safe_directory(path)
    prepare(PRODUCTION, BACKUPS)
    lock_fd = os.open(BACKUPS / 'release.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.action == 'publish':
            manifest = publish(args.dist, PRODUCTION, BACKUPS)
        else:
            manifest = rollback(PRODUCTION, BACKUPS, args.release_id)
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        print(f'Release not completed: {error}', file=sys.stderr)
        sys.exit(1)

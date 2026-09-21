#!/usr/bin/env python3
"""Run manually in a real terminal after Caddy installation. Never echoes a hash."""
import grp
import os
from pathlib import Path
import re
import subprocess
import sys


def main():
    if os.geteuid() != 0 or not sys.stdin.isatty():
        raise ValueError('Run with scoped sudo in an interactive terminal, not in chat')
    directory = Path('/etc/caddy')
    if directory.is_symlink() or not directory.is_dir() or directory.stat().st_uid != 0:
        raise ValueError('Expected the installed root-owned /etc/caddy directory')
    if directory.stat().st_mode & 0o022:
        raise ValueError('/etc/caddy must not be writable by group or others')
    target = directory / 'pirata-access.caddy'
    if target.exists() or target.is_symlink():
        raise ValueError('Access configuration already exists; review a rotation separately')
    username = input('Choose a separate Pirata username (letters, digits, _ or -): ').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', username):
        raise ValueError('Invalid username')
    print('Choose a unique Pirata password. Do not use your Hostinger password.')
    # stdin remains the controlling terminal; Caddy disables password echo.
    result = subprocess.run(['caddy', 'hash-password', '--algorithm', 'argon2id'],
                            stdout=subprocess.PIPE, check=True, text=True)
    password_hash = result.stdout.strip()
    if not re.fullmatch(r'\$argon2id\$[A-Za-z0-9+/=$,.-]+', password_hash):
        raise ValueError('Caddy returned an unexpected hash format; nothing written')
    caddy_gid = grp.getgrnam('caddy').gr_gid
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
    with os.fdopen(descriptor, 'w') as output:
        os.fchown(output.fileno(), 0, caddy_gid)
        os.fchmod(output.fileno(), 0o640)
        output.write('basic_auth argon2id {\n    ' + username + ' ' + password_hash + '\n}\n')
        output.flush()
        os.fsync(output.fileno())
    print('Private access configuration created. Hash and password were not printed.')
    print('Validate the full Caddy configuration before activating it. No service was reloaded.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        print('Access setup did not complete: ' + str(error), file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Verify a complete private backup and restore only to a NEW scratch directory."""
import argparse
from pathlib import Path
import subprocess
from backup import restore_bundle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--node', type=Path)
    parser.add_argument('--cli', type=Path)
    args = parser.parse_args()
    if bool(args.node) != bool(args.cli):
        parser.error('Use --node and --cli together to test forward migrations')
    def migrate(source, target):
        subprocess.run([str(args.node), str(args.cli), 'restore', str(source), str(target)],
                       check=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                       stderr=subprocess.PIPE)
    record = restore_bundle(args.database, args.destination, migrate if args.cli else None)
    print('Scratch database and', len(record['files']), 'upload files verified. Live data unchanged.')


if __name__ == '__main__':
    main()

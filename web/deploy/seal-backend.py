#!/usr/bin/env python3
"""Seal pnpm 11 legacy deployment's workspace links into a standalone backend."""
import json, os, shutil, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def seal(target):
    target=Path(target).absolute()
    if target.parent!=Path('/tmp') or not target.name.startswith('pirata-server-candidate-') or target.is_symlink(): raise ValueError('Expected a new Pirata candidate under /tmp')
    for name in ('domain','contracts'):
        source=ROOT/'packages'/name;dest=target/'node_modules/@pirata'/name
        if dest.is_symlink():
            if dest.resolve()!=source: raise ValueError('Unexpected workspace dependency')
            dest.unlink();dest.mkdir()
            shutil.copytree(source/'dist',dest/'dist')
            shutil.copyfile(source/'package.json',dest/'package.json')
        elif not dest.is_dir() or (dest/'package.json').read_bytes()!=(source/'package.json').read_bytes(): raise ValueError('Unexpected sealed workspace package')
    for path in target.rglob('*'):
        if path.is_symlink():
            resolved=path.resolve(strict=True)
            if resolved==ROOT/'server':
                path.unlink();path.symlink_to(os.path.relpath(target,path.parent));resolved=path.resolve(strict=True)
            for name in ('domain','contracts'):
                if resolved==ROOT/'packages'/name:
                    path.unlink();path.symlink_to(os.path.relpath(target/'node_modules/@pirata'/name,path.parent));resolved=path.resolve(strict=True)
            if not resolved.is_relative_to(target): raise ValueError('External deployment symlink: '+str(path.relative_to(target)))
        elif path.is_file() and (path.name.startswith('.env') or path.suffix in ('.sqlite','.db') or '.sqlite-' in path.name): raise ValueError('Private data found in candidate')
    # Every third-party package version must already be installed in the source's locked store.
    canonical=ROOT/'node_modules/.pnpm'
    for package in (target/'node_modules/.pnpm').iterdir():
        if package.is_dir() and package.name!='node_modules' and not (canonical/package.name).exists(): raise ValueError('Unexpected dependency version: '+package.name)
    print('Standalone backend sealed; all links stay inside the package; no database or environment files.')
if __name__=='__main__': seal(sys.argv[1])

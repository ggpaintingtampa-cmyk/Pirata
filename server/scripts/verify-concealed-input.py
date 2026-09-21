#!/usr/bin/env python3
"""Actual CLI PTY regression; uses only temporary databases and source mirrors."""
import os
from pathlib import Path
import pty
import secrets
import select
import signal
import sqlite3
import subprocess
import tempfile
import termios
import time

ROOT = Path(__file__).resolve().parents[1]
NODE = '/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
PROMPTS = [b'New owner password (hidden): ', b'Repeat password (hidden): ']

with tempfile.TemporaryDirectory(prefix='pirata-concealed-review-') as folder:
    temp = Path(folder)
    (temp / 'package.json').write_text('{"type":"module"}')
    (temp / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
    src = temp / 'src'
    src.mkdir()
    for item in ['config.ts', 'db', 'auth']:
        (src / item).symlink_to(ROOT / 'src' / item, target_is_directory=(ROOT / 'src' / item).is_dir())
    for label in ['fixed']:
        (src / (label + '.ts')).write_text((ROOT / 'src/cli.ts').read_text())
    hook = temp / 'prompt-probe.mjs'
    hook.write_text('''
const originalWrite = process.stdout.write;
process.stdout.write = function(chunk, ...args) {
  const prompt = String(chunk).includes('password (hidden): ');
  if (prompt && process.env.PIRATA_PROBE_GUARD === '1' &&
      (!process.stdin.isRaw || process.stdin.listenerCount('data') === 0)) {
    throw new Error('Prompt became visible before concealed input was ready.');
  }
  const result = originalWrite.call(this, chunk, ...args);
  // Force the scheduler window at the exact output boundary. Old source has
  // echo enabled here; fixed source must already have raw mode and a handler.
  if (prompt) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
  return result;
};
''')

    def environment(label, guard=False):
        return {**os.environ, 'PIRATA_DB_PATH': str(temp / (label + '.sqlite')),
                'PIRATA_ORIGIN': 'https://pirata.test',
                'PIRATA_PROBE_GUARD': '1' if guard else '0'}

    def command(label, action):
        return [NODE, '--import', 'tsx', '--import', str(hook), str(src / (label + '.ts')), action]

    def interactive(label, action, *, guard=False, cancel=None, interrupt=None, expected=0):
        master, slave = pty.openpty()
        before = termios.tcgetattr(slave)
        child = subprocess.Popen(command(label, action), cwd=ROOT,
                                 env=environment(label, guard), stdin=slave, stdout=slave, stderr=slave)
        captured = b''
        password = secrets.token_urlsafe(24).encode()
        try:
            for prompt in PROMPTS:
                deadline = time.monotonic() + 15
                while prompt not in captured:
                    if select.select([master], [], [], .05)[0]:
                        captured += os.read(master, 8192)
                    elif child.poll() is not None:
                        raise AssertionError('CLI ended before the expected prompt')
                    assert time.monotonic() < deadline, 'Prompt timeout'
                if cancel is not None:
                    os.write(master, password + cancel)
                    break
                if interrupt is not None:
                    os.kill(child.pid, interrupt)
                    break
                os.write(master, password + b'\r')
            child.wait(timeout=15)
            while select.select([master], [], [], .05)[0]:
                captured += os.read(master, 8192)
            assert child.returncode == expected, 'Unexpected CLI exit status'
            after = termios.tcgetattr(slave)
            mask = termios.ECHO | termios.ICANON | termios.ISIG
            assert (before[3] & mask) == (after[3] & mask), 'Terminal flags were not restored'
            return password in captured
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
            os.close(master)
            os.close(slave)

    for label in ['fixed']:
        result = subprocess.run(command(label, 'migrate'), cwd=ROOT, env=environment(label),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        assert result.returncode == 0, 'Isolated migration failed'

    assert not interactive('fixed', 'setup', guard=True), 'Fixed setup echoed input'
    assert not interactive('fixed', 'recover', guard=True), 'Fixed recovery echoed input'
    print('PASS: actual fixed setup/recovery installs raw mode and handler before both prompts; no echo; terminal restored')

    for cancel in [b'\x03', b'\x04']:
        assert not interactive('fixed', 'recover', guard=True, cancel=cancel, expected=1), 'Cancellation echoed input'
    for interrupt in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
        assert not interactive('fixed', 'recover', guard=True, interrupt=interrupt, expected=1), 'Signal cancellation echoed input'
    print('PASS: Ctrl-C/Ctrl-D and SIGINT/SIGTERM/SIGHUP cancel and restore terminal state')

    with sqlite3.connect(temp / 'fixed.sqlite') as db:
        assert db.execute('SELECT count(*) FROM owners').fetchone()[0] == 1
    result = subprocess.run(command('fixed', 'recover'), cwd=ROOT, env=environment('fixed'),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL)
    assert result.returncode == 1, 'Noninteractive credentials were accepted'
    print('PASS: one owner remains; noninteractive concealed input remains rejected')

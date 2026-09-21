#!/usr/bin/env python3
"""Root-only concealed API-key installation. Never accepts secrets as arguments."""
import getpass, os, pathlib, pwd, subprocess, sys, tempfile
if os.geteuid() != 0:
    raise SystemExit('Run this reviewed script with sudo from a private terminal.')
if len(sys.argv) != 1 or not sys.stdin.isatty():
    raise SystemExit('Use an interactive terminal; no arguments or piped secrets are accepted.')
key = getpass.getpass('OpenAI API key (hidden): ').strip()
if len(key) < 20 or any(c.isspace() for c in key):
    raise SystemExit('A valid API key is required. Nothing changed.')
if key != getpass.getpass('Confirm API key (hidden): ').strip():
    raise SystemExit('Keys did not match. Nothing changed.')
account = pwd.getpwnam('pirata')
directory = pathlib.Path('/etc/pirata')
directory.mkdir(mode=0o750, exist_ok=True)
os.chown(directory, 0, account.pw_gid)
os.chmod(directory, 0o750)
fd, temporary = tempfile.mkstemp(prefix='.openai-', dir=directory)
try:
    os.fchmod(fd, 0o600)
    os.fchown(fd, account.pw_uid, account.pw_gid)
    with os.fdopen(fd, 'w') as stream:
        stream.write(key + '\n'); stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary, directory / 'openai.key')
finally:
    if os.path.exists(temporary): os.unlink(temporary)
# Only this application's service needs HTTPS egress. No firewall or other service changes.
dropin = pathlib.Path('/etc/systemd/system/pirata-api.service.d')
dropin.mkdir(mode=0o755, exist_ok=True)
(dropin / 'ai.conf').write_text('[Service]\nEnvironment=PIRATA_OPENAI_API_KEY_FILE=/etc/pirata/openai.key\nIPAddressDeny=\nIPAddressAllow=\n')
os.chmod(dropin / 'ai.conf', 0o644)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'restart', 'pirata-api.service'], check=True)
print('Private API key installed. Set model, current token prices and usage allowance in Menu → Ask settings before enabling live requests.')

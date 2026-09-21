#!/usr/bin/env python3
"""Add only Pirata to the existing Caddy service after private owner setup."""
import datetime, grp, json, os, shutil, socket, sqlite3, stat, subprocess, time, urllib.error, urllib.request, uuid
from pathlib import Path
ROOT=Path('/srv/pirata');CONFIG=Path('/etc/caddy/Caddyfile');SITE=Path('/etc/caddy/pirata.caddy');ACCESS=Path('/etc/caddy/pirata-access.caddy')
SOURCE=Path('/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web/deploy/Caddyfile.example')
def status(url):
    try:
        with urllib.request.urlopen(url,timeout=5) as r: return r.status
    except urllib.error.HTTPError as e: return e.code

def run(args):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if p.returncode: raise RuntimeError('Command failed: '+args[0]+' '+args[1]+'; original configuration will be retained/restored')

def main():
    if os.geteuid()!=0 or socket.gethostname()!='srv1972305': raise ValueError('Run with scoped root on the verified VPS')
    if SITE.exists() or SITE.is_symlink(): raise ValueError('Pirata site already exists: inspect instead of overwriting')
    if not CONFIG.is_file() or CONFIG.is_symlink() or ACCESS.is_symlink(): raise ValueError('Unexpected config paths')
    info=ACCESS.stat()
    if info.st_uid!=0 or info.st_gid!=grp.getgrnam('caddy').gr_gid or stat.S_IMODE(info.st_mode)!=0o640: raise ValueError('Access configuration permissions are incorrect')
    with sqlite3.connect('file:/var/lib/pirata/pirata.sqlite?mode=ro',uri=True) as db:
        if db.execute('SELECT count(*) FROM owners').fetchone()[0]!=1: raise ValueError('Complete interactive owner setup first')
    run(['systemctl','is-active','--quiet','pirata-api.service'])
    run(['systemctl','start','pirata-backup.service'])
    if status('http://127.0.0.1:3001/api/v1/health')!=200: raise ValueError('Private API not ready')
    if status('https://research.andresinbox.tech/')!=401: raise ValueError('Research baseline differs; inspect before altering the shared proxy')
    original=CONFIG.read_bytes()
    if b'pirata' in original: raise ValueError('Pirata configuration already referenced; inspect')
    token=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
    backup=Path('/var/backups/pirata')/('activation-'+token);backup.mkdir(mode=0o700)
    (backup/'Caddyfile').write_bytes(original);(backup/'Caddyfile').chmod(0o600)
    shutil.copyfile(ACCESS,backup/'pirata-access.caddy');(backup/'pirata-access.caddy').chmod(0o600)
    temporary=Path('/etc/caddy')/('.pirata-candidate-'+token)
    applied=False
    try:
        with SITE.open('xb') as output: output.write(SOURCE.read_bytes())
        SITE.chmod(0o644)
        temporary.write_bytes(original.rstrip()+b'\nimport /etc/caddy/pirata.caddy\n');temporary.chmod(stat.S_IMODE(CONFIG.stat().st_mode))
        run(['caddy','validate','--config',str(temporary),'--adapter','caddyfile'])
        os.replace(temporary,CONFIG);applied=True
        run(['systemctl','reload','caddy'])
        ready=False
        for _ in range(40):
            try:
                if status('https://pirata.andresinbox.tech/')==401: ready=True;break
            except (OSError,urllib.error.URLError): pass
            time.sleep(1.5)
        if not ready: raise ValueError('Public HTTPS did not become ready in the verification window')
        if status('https://research.andresinbox.tech/')!=401: raise ValueError('Research verification failed')
        print(json.dumps({'status':'HTTPS active; anonymous page rejected; authenticated verification pending','backup':str(backup),'webRelease':(ROOT/'current').resolve().name,'apiRelease':(ROOT/'api-current').resolve().name}))
    except BaseException:
        if applied:
            temporary.write_bytes(original);temporary.chmod(0o644);os.replace(temporary,CONFIG)
            run(['caddy','validate','--config',str(CONFIG),'--adapter','caddyfile']);run(['systemctl','reload','caddy'])
        SITE.unlink(missing_ok=True)
        raise
    finally: temporary.unlink(missing_ok=True)
if __name__=='__main__':
    try: main()
    except Exception as e: raise SystemExit('Activation stopped: '+str(e))

#!/usr/bin/env python3
"""Scoped initial Pirata installation. Does not activate a public site or choose a password."""
import datetime, hashlib, json, os, pwd, shutil, socket, stat, subprocess, sys, time, urllib.request, uuid
from pathlib import Path
from release import prepare, publish, inspect_dist
SOURCE=Path('/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web/deploy')
ROOT=Path('/srv/pirata');BACKUPS=Path('/var/backups/pirata');STATE=Path('/var/lib/pirata')
RUNTIME=Path('/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')
def run(args): subprocess.run(args,check=True)
def main(candidate):
    if os.geteuid()!=0 or socket.gethostname()!='srv1972305': raise ValueError('Requires scoped root access on the verified VPS')
    candidate=Path(candidate).absolute()
    if candidate.parent!=Path('/tmp') or not candidate.name.startswith('pirata-server-candidate-') or candidate.is_symlink(): raise ValueError('Unexpected candidate path')
    units=['pirata-api.service','pirata-backup.service','pirata-backup.timer']
    destinations=[ROOT,BACKUPS,STATE,Path('/etc/caddy/pirata.caddy'),Path('/etc/caddy/pirata-access.caddy'),*[Path('/etc/systemd/system')/name for name in units]]
    if any(p.exists() or p.is_symlink() for p in destinations): raise ValueError('Existing Pirata installation or partial installation: inspect before retrying; nothing overwritten')
    try: pwd.getpwnam('pirata');raise ValueError('Existing pirata system account: inspect before installing')
    except KeyError: pass
    with socket.socket() as probe: probe.bind(('127.0.0.1',3001))
    for required in [candidate/'dist/main.js',candidate/'dist/cli.js',candidate/'src/db/migrations',RUNTIME]:
        if not required.exists(): raise ValueError('Missing deployment input: '+str(required))
    inspect_dist(SOURCE.parent/'dist')
    for p in candidate.rglob('*'):
        if p.is_symlink() and not p.resolve(strict=True).is_relative_to(candidate): raise ValueError('External package symlink')
        if p.name.startswith('.env') or p.suffix in ('.sqlite','.db'): raise ValueError('Private data in candidate')
    prepare(ROOT,BACKUPS)
    config_backup=BACKUPS/'configuration-before-pirata';config_backup.mkdir(mode=0o700)
    shutil.copyfile('/etc/caddy/Caddyfile',config_backup/'Caddyfile');(config_backup/'Caddyfile').chmod(0o600)
    zone=Path('/home/andre/Downloads/andresinbox.tech (2).txt')
    if zone.is_file() and not zone.is_symlink(): shutil.copyfile(zone,config_backup/'dns-zone-before.txt');(config_backup/'dns-zone-before.txt').chmod(0o600)
    try: pwd.getpwnam('pirata');raise ValueError('An unexpected pirata system account exists; review first')
    except KeyError: run(['useradd','--system','--home-dir',str(STATE),'--no-create-home','--shell','/usr/sbin/nologin','pirata'])
    owner=pwd.getpwnam('pirata');STATE.mkdir(mode=0o700);os.chown(STATE,owner.pw_uid,owner.pw_gid)
    (ROOT/'runtime').mkdir(mode=0o755);shutil.copyfile(RUNTIME,ROOT/'runtime/node');(ROOT/'runtime/node').chmod(0o755)
    release_id=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
    (ROOT/'api-releases').mkdir(mode=0o755);release=ROOT/'api-releases'/release_id
    shutil.copytree(candidate,release,symlinks=True)
    for p in [release,*release.rglob('*')]:
        if p.is_symlink():
            if not p.resolve(strict=True).is_relative_to(release): raise ValueError('Relocated package symlink escapes release')
            continue
        p.chmod(0o755 if p.is_dir() or p.stat().st_mode&stat.S_IXUSR else 0o644)
    (ROOT/'api-current').symlink_to('api-releases/'+release_id)
    operations=ROOT/'operations';operations.mkdir(mode=0o755)
    shutil.copyfile(SOURCE/'backup.py',operations/'backup.py');(operations/'backup.py').chmod(0o644)
    for name in ['pirata-api.service','pirata-backup.service','pirata-backup.timer']:
        shutil.copyfile(SOURCE/name,Path('/etc/systemd/system')/name);(Path('/etc/systemd/system')/name).chmod(0o644)
    run(['runuser','-u','pirata','--','env','PIRATA_DB_PATH='+str(STATE/'pirata.sqlite'),str(ROOT/'runtime/node'),str(release/'dist/cli.js'),'migrate'])
    web_manifest=publish(SOURCE.parent/'dist',ROOT,BACKUPS)
    hashes={str(p.relative_to(release)):hashlib.sha256(p.read_bytes()).hexdigest() for p in release.rglob('*') if p.is_file() and not p.is_symlink()}
    report={'apiReleaseId':release_id,'webReleaseId':web_manifest['releaseId'],'runtimeSha256':hashlib.sha256((ROOT/'runtime/node').read_bytes()).hexdigest(),'apiFiles':hashes}
    report_path=BACKUPS/(release_id+'-backend.json');report_path.write_text(json.dumps(report,indent=2)+'\n');report_path.chmod(0o600)
    run(['systemd-analyze','verify',*[str(Path('/etc/systemd/system')/name) for name in units]])
    run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','pirata-api.service'])
    healthy=0
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/v1/health',timeout=2) as response:
                if json.load(response)!={'status':'ok'}: raise ValueError('Unexpected health response')
            run(['systemctl','is-active','--quiet','pirata-api.service']);healthy+=1
            if healthy==3: break
        except (OSError,ValueError,subprocess.CalledProcessError): healthy=0
        time.sleep(1)
    if healthy<3: raise ValueError('API not ready. Public configuration has not been activated; inspect the private service')
    listeners=subprocess.check_output(['ss','-H','-lnt','sport = :3001'],text=True).splitlines()
    if len(listeners)!=1 or listeners[0].split()[3]!='127.0.0.1:3001': raise ValueError('Unexpected API listening address')
    run(['systemctl','enable','--now','pirata-backup.timer']);run(['systemctl','start','pirata-backup.service'])
    if not list((BACKUPS/'database').glob('*.sqlite')): raise ValueError('Initial backup was not produced')
    print(json.dumps({'apiReleaseId':release_id,'webReleaseId':web_manifest['releaseId'],'status':'installed-private; owner credential and Caddy activation pending'}))
if __name__=='__main__':
    try: main(sys.argv[1])
    except Exception as e: raise SystemExit('Installation stopped: '+str(e))

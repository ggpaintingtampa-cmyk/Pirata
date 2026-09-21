#!/usr/bin/env python3
"""Publish a reviewed, sealed backend with unchanged migration files; preserve rollback."""
import datetime,hashlib,json,os,shutil,socket,stat,subprocess,sys,time,urllib.request,uuid
from pathlib import Path
ROOT=Path('/srv/pirata');BACKUPS=Path('/var/backups/pirata')
def run(args):subprocess.run(args,check=True)
def hashes(root):return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file() and not p.is_symlink()}
def switch(release):
    temporary=ROOT/('.api-'+uuid.uuid4().hex);temporary.symlink_to('api-releases/'+release.name);os.replace(temporary,ROOT/'api-current')
def healthy():
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/v1/health',timeout=2) as r:
                if json.load(r)=={'status':'ok'}:return
        except OSError:pass
        time.sleep(.3)
    raise ValueError('API did not become ready')
def main(candidate):
    if os.geteuid()!=0 or socket.gethostname()!='srv1972305':raise ValueError('Requires scoped root on the verified VPS')
    candidate=Path(candidate).absolute()
    if candidate.parent!=Path('/tmp') or not candidate.name.startswith('pirata-server-candidate-') or candidate.is_symlink():raise ValueError('Unexpected candidate path')
    previous=(ROOT/'api-current').resolve(strict=True)
    if previous.parent!=ROOT/'api-releases':raise ValueError('Unexpected current API')
    if hashes(candidate/'src/db/migrations')!=hashes(previous/'src/db/migrations'):raise ValueError('Schema changes need a reviewed migration deployment, not this code-only command')
    for p in candidate.rglob('*'):
        if p.is_symlink() and (p.readlink().is_absolute() or not p.resolve(strict=True).is_relative_to(candidate)):raise ValueError('Candidate link escapes or is absolute')
        if p.name.startswith('.env') or p.suffix in ('.sqlite','.db'):raise ValueError('Private file in candidate')
    if not (candidate/'dist/main.js').is_file() or not (candidate/'dist/cli.js').is_file():raise ValueError('Missing built code')
    run(['systemctl','start','pirata-backup.service'])
    release_id=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
    release=ROOT/'api-releases'/release_id;shutil.copytree(candidate,release,symlinks=True)
    for p in [release,*release.rglob('*')]:
        if p.is_symlink():
            if not p.resolve(strict=True).is_relative_to(release):raise ValueError('Relocated package link escapes')
        else:p.chmod(0o755 if p.is_dir() or p.stat().st_mode&stat.S_IXUSR else 0o644)
    report={'apiReleaseId':release_id,'previousApiReleaseId':previous.name,'webReleaseId':(ROOT/'current').resolve().name,'apiFiles':hashes(release),'runtimeSha256':hashlib.sha256((ROOT/'runtime/node').read_bytes()).hexdigest()}
    manifest=BACKUPS/(release_id+'-backend.json');manifest.write_text(json.dumps(report,indent=2)+'\n');manifest.chmod(0o600)
    try:switch(release);run(['systemctl','restart','pirata-api.service']);healthy()
    except BaseException:switch(previous);run(['systemctl','restart','pirata-api.service']);healthy();raise
    print(json.dumps({k:v for k,v in report.items() if k!='apiFiles'}))
if __name__=='__main__':main(sys.argv[1])

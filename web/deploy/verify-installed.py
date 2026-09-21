#!/usr/bin/env python3
"""Exercise installed backups while the still-private API runs and stops, then restore scratch."""
import hashlib,json,os,pwd,sqlite3,subprocess,time,urllib.request,uuid
from pathlib import Path
ROOT=Path('/srv/pirata');STATE=Path('/var/lib/pirata');BACKUPS=Path('/var/backups/pirata')
def run(args): return subprocess.run(args,check=True,capture_output=True,text=True).stdout.strip()
def health():
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/v1/health',timeout=2) as r:
                if json.load(r)=={'status':'ok'}: return
        except OSError: pass
        time.sleep(.2)
    raise ValueError('API health unavailable')
def main():
    if os.geteuid()!=0: raise ValueError('Requires scoped root')
    if Path('/etc/caddy/pirata.caddy').exists(): raise ValueError('Stop/start exercise is only for the initial private preflight')
    owner=pwd.getpwnam('pirata');health()
    run(['systemctl','start','pirata-backup.service'])
    warm=max((BACKUPS/'database').glob('*.sqlite'),key=lambda p:p.stat().st_mtime_ns)
    try:
        run(['systemctl','stop','pirata-api.service'])
        if (STATE/'pirata.sqlite-wal').exists(): raise ValueError('Cold test requires clean shutdown without WAL')
        run(['systemctl','start','pirata-backup.service'])
        cold=max((BACKUPS/'database').glob('*.sqlite'),key=lambda p:p.stat().st_mtime_ns)
        if warm==cold: raise ValueError('Cold backup missing')
    finally: run(['systemctl','start','pirata-api.service'])
    health()
    for p in STATE.glob('pirata.sqlite*'):
        if p.stat().st_uid!=owner.pw_uid or p.stat().st_mode&0o077: raise ValueError('Database file ownership/mode incorrect')
    scratch=BACKUPS/('restore-check-'+uuid.uuid4().hex+'.sqlite')
    before=hashlib.sha256(cold.read_bytes()).hexdigest()
    run([str(ROOT/'runtime/node'),str(ROOT/'api-current/dist/cli.js'),'restore',str(cold),str(scratch)])
    if hashlib.sha256(cold.read_bytes()).hexdigest()!=before: raise ValueError('Restore altered its source')
    with sqlite3.connect(scratch.as_uri()+'?mode=ro&immutable=1',uri=True) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall(): raise ValueError('Restored backup failed integrity')
        columns=[r[1] for r in db.execute('PRAGMA table_info(schema_versions)')]
        migrations=[dict(zip(columns,row)) for row in db.execute('SELECT * FROM schema_versions')]
    report={'warmBackup':str(warm),'coldBackup':str(cold),'scratchRestore':str(scratch),'backupSha256':before,'migrations':migrations,'apiEnabled':run(['systemctl','is-enabled','pirata-api.service']),'backupEnabled':run(['systemctl','is-enabled','pirata-backup.timer']),'status':'PASS: installed live and cold backups, scratch restore, API restart, private DB ownership'}
    (BACKUPS/'initial-verification.json').write_text(json.dumps(report,indent=2)+'\n');(BACKUPS/'initial-verification.json').chmod(0o600)
    print(json.dumps(report))
if __name__=='__main__':main()

#!/usr/bin/env python3
"""Owner runs this in a real terminal. Passwords/hashes never enter chat, argv or logs."""
import getpass, grp, os, pwd, re, sqlite3, subprocess, sys, time, uuid
from pathlib import Path
STATE=Path('/var/lib/pirata/pirata.sqlite');TARGET=Path('/etc/caddy/pirata-access.caddy')
def valid_password(password):
    # Match the existing JavaScript login/schema length, including emoji.
    return 15 <= len(password.encode('utf-16-le')) // 2 <= 128

def main():
    if os.geteuid()!=0 or not sys.stdin.isatty(): raise ValueError('Run in an interactive terminal with scoped sudo')
    if TARGET.exists() or TARGET.is_symlink(): raise ValueError('Access gate already exists; request a reviewed recovery instead')
    if not STATE.is_file() or STATE.is_symlink(): raise ValueError('Install the private backend first')
    account=pwd.getpwnam('pirata')
    def database_identity(): os.setegid(account.pw_gid);os.seteuid(account.pw_uid)
    def root_identity(): os.seteuid(0);os.setegid(0)
    database_identity()
    db=sqlite3.connect(STATE)
    try:
        if db.execute('SELECT count(*) FROM owners').fetchone()[0]: raise ValueError('An owner already exists; setup will not replace credentials')
        print('Create your Pirata-only password. Username at the outer site gate will be: owner')
        password=getpass.getpass('New Pirata password (15–128 characters, hidden): ')
        if not valid_password(password): raise ValueError('Use 15–128 characters')
        if password!=getpass.getpass('Repeat password (hidden): '): raise ValueError('Passwords do not match')
        result=subprocess.run(['caddy','hash-password','--algorithm','argon2id','--argon2id-memory','19456','--argon2id-time','2'],input=password+'\n',text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
        hashed=result.stdout.strip();password=''
        if not re.fullmatch(r'\$argon2id\$[A-Za-z0-9+/=$,.-]+',hashed): raise ValueError('Unexpected hash format')
        now=int(time.time()*1000);owner_id=str(uuid.uuid4())
        db.execute('BEGIN IMMEDIATE')
        db.execute('INSERT INTO owners (id,password_hash,created_at,updated_at) VALUES (?,?,?,?)',(owner_id,hashed,now,now));db.execute('INSERT INTO data_revisions (owner_id) VALUES (?)',(owner_id,))
        root_identity()
        fd=os.open(TARGET,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o640)
        try:
            with os.fdopen(fd,'w') as output:
                os.fchown(output.fileno(),0,grp.getgrnam('caddy').gr_gid);os.fchmod(output.fileno(),0o640);output.write('basic_auth argon2id Pirata {\n    owner '+hashed+'\n}\n');output.flush();os.fsync(output.fileno())
            database_identity();db.commit();root_identity()
        except BaseException:
            database_identity();db.rollback();root_identity();TARGET.unlink(missing_ok=True);raise
        result=subprocess.run(['systemctl','start','pirata-backup.service'],check=False)
        if result.returncode: print('Owner was created, but the follow-up backup needs attention before activation.')
        print('Owner access created. Use username owner and this same Pirata password at both sign-in prompts. No password or hash was printed. Tell Codex: owner setup done.')
    finally:
        database_identity();db.close();root_identity()
if __name__=='__main__':
    try: main()
    except (Exception,KeyboardInterrupt): raise SystemExit('Owner setup did not complete. Existing credentials were not replaced. Check the input and installation locally.')

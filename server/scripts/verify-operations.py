from pathlib import Path
import os,subprocess,tempfile,socket,time,json,urllib.request,pty,select,shutil
r=Path(__file__).resolve().parents[2];node=shutil.which('node');assert node, 'Put bundled Node on PATH first'
with tempfile.TemporaryDirectory(prefix='pirata-ops-') as temp:
 d=Path(temp);env={**os.environ,'PIRATA_DB_PATH':str(d/'main.sqlite'),'PIRATA_ORIGIN':'https://pirata.test'}
 def cli(*args,expected=0):
  p=subprocess.run([node,'--import','tsx','src/cli.ts',*args],cwd=r/'server',env=env,capture_output=True,text=True)
  assert p.returncode==expected,(args,p.stdout,p.stderr)
  return p
 cli('migrate');cli('setup',expected=1)
 # Confirm no credential default or setup record on noninteractive failure.
 import sqlite3
 with sqlite3.connect(d/'main.sqlite') as db:assert db.execute('select count(*) from owners').fetchone()[0]==0
 # A real pseudo-terminal verifies concealed setup and recovery without secrets in output.
 def interactive(action):
  master,slave=pty.openpty();child=subprocess.Popen([node,'--import','tsx','src/cli.ts',action],cwd=r/'server',env=env,stdin=slave,stdout=slave,stderr=slave);os.close(slave)
  captured=b'';password=b'isolated-pty-test-password';deadline=time.time()+15
  try:
   for prompt in [b'New owner password (hidden): ',b'Repeat password (hidden): ']:
    while prompt not in captured:
     assert time.time()<deadline,'interactive prompt timeout'
     if select.select([master],[],[],.1)[0]:captured+=os.read(master,8192)
    os.write(master,password+b'\r')
   child.wait(timeout=15)
   while select.select([master],[],[],.1)[0]:
    try:captured+=os.read(master,8192)
    except OSError:break
   assert child.returncode==0,captured.decode()
   assert password not in captured,'concealed input was echoed'
  finally:
   if child.poll() is None:child.kill();child.wait()
   os.close(master)
 interactive('setup');interactive('recover')
 cli('backup',str(d/'backup.sqlite'));cli('restore',str(d/'backup.sqlite'),str(d/'scratch.sqlite'))
 cli('restore',str(d/'backup.sqlite'),str(d/'scratch.sqlite'),expected=1)
 with socket.socket() as listener:
  listener.bind(('127.0.0.1',0));listener.listen();env['PIRATA_PORT']=str(listener.getsockname()[1])
  occupied=subprocess.run([node,'dist/main.js'],cwd=r/'server',env=env,capture_output=True,text=True,timeout=15)
  assert occupied.returncode==1,(occupied.stdout,occupied.stderr)
 # Normal built startup, restart and loopback health on known test port.
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 env['PIRATA_PORT']=str(port)
 p=subprocess.Popen([node,'dist/main.js'],cwd=r/'server',env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  for _ in range(100):
   try:
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/v1/health') as response:assert json.load(response)=={'status':'ok'}
    break
   except OSError:time.sleep(.05)
  else:raise AssertionError('health did not become ready')
 finally:p.terminate();p.communicate(timeout=10)
 print('PASS: CLI migrate, concealed setup/recovery/no default owner, backup, scratch restore/integrity, overwrite refusal, occupied-port failure, built loopback start/health/shutdown')

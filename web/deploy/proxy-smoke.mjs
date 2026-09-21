// Real built frontend + sealed backend + Caddy, all on disposable loopback fixtures.
import { chromium } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const packageRoot=resolve(process.argv[2]);
if(!packageRoot.startsWith('/tmp/pirata-server-candidate-'))throw new Error('Use a sealed disposable candidate');
const load=name=>import(pathToFileURL(join(packageRoot,'dist',name+'.js')).href);
const {openDatabase}=await load('db/database'),{setOwnerPassword}=await load('auth/password'),{createApp}=await load('app'),{executeImport}=await load('integration/import');
const dir=await mkdtemp(join(tmpdir(),'pirata-proxy-smoke-')),origin='http://127.0.0.1:5184';
const web=fileURLToPath(new URL('../',import.meta.url)),template=await readFile(new URL('./Caddyfile.example',import.meta.url),'utf8');
const password='isolated-proxy-verification-password';
let db=openDatabase(join(dir,'test.sqlite'),{create:true});const owner=await setOwnerPassword(db,password,'setup');
const seed=JSON.parse(await readFile(new URL('../../server/tests/integration/demo-v1.json',import.meta.url),'utf8'));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format();
seed.seededOn=today;for(const a of [seed.objectives,seed.schedule])for(const x of a)x.date=today;for(const x of seed.expenses)x.purchaseDate=today;for(const x of seed.maintenance)x.dueDate=today;for(const x of seed.leads)x.nextFollowUpDate=today;
executeImport(db,owner,{state:seed,timerChoice:'discard',requestId:crypto.randomUUID(),baseRevision:0,confirmed:true},Date.now());
let app=createApp({db,origin});await app.listen({host:'127.0.0.1',port:3006});
const hash=spawnSync('caddy',['hash-password','--algorithm','argon2id'],{input:password+'\n',encoding:'utf8'});assert.equal(hash.status,0);await writeFile(join(dir,'access.caddy'),'basic_auth argon2id {\n owner '+hash.stdout.trim()+'\n}\n',{mode:0o600});
const config='{\n admin off\n auto_https off\n}\n'+template.replace('pirata.andresinbox.tech {',origin+' {\n bind 127.0.0.1').replaceAll('/srv/pirata/current',JSON.stringify(join(web,'dist'))).replaceAll('/srv/pirata/shared',JSON.stringify(join(web,'dist'))).replace('/etc/caddy/pirata-access.caddy',join(dir,'access.caddy')).replace('127.0.0.1:3001','127.0.0.1:3006');
await writeFile(join(dir,'Caddyfile'),config,{mode:0o600});
const valid=spawnSync('caddy',['validate','--config',join(dir,'Caddyfile'),'--adapter','caddyfile'],{encoding:'utf8'});assert.equal(valid.status,0,'Caddy validation failed');
const caddy=spawn('caddy',['run','--config',join(dir,'Caddyfile'),'--adapter','caddyfile'],{stdio:['ignore','pipe','pipe']});
let browser;
try{
 for(let i=0;i<50;i++){try{await fetch(origin);break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const html=await readFile(join(web,'dist/index.html'),'utf8'),asset=html.match(/src="([^"]+\.js)"/)[1].replace(/^\.\//,'/');
 for(const path of ['/',asset,'/api/v1/snapshot'])assert.equal((await fetch(origin+path)).status,401,'Whole-site gate '+path);
 const auth={Authorization:'Basic '+Buffer.from('owner:'+password).toString('base64')};
 for(const path of ['/.env','/.git/config','/server/var/pirata.sqlite','/backups','/assets/missing.js','/src/main.tsx'])assert.equal((await fetch(origin+path,{headers:auth})).status,404,'Private/missing path '+path);
 const response=await fetch(origin,{headers:auth});assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(response.headers.get('x-frame-options'),'DENY');
 browser=await chromium.launch({headless:true});const context=await browser.newContext({httpCredentials:{username:'owner',password},viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(origin);await page.getByLabel('Pirata password').fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Today.',exact:true}).waitFor();
 assert(await page.getByText('$84.60',{exact:true}).isVisible());await page.getByRole('button',{name:'Start timer',exact:true}).click();await page.getByRole('button',{name:'Confirm start timer'}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 const running=db.prepare('SELECT session_id FROM running_timers').get();assert(running);
 await app.close();db.close();db=openDatabase(join(dir,'test.sqlite'));app=createApp({db,origin});await app.listen({host:'127.0.0.1',port:3006});
 await page.reload();await page.getByRole('button',{name:'Pause timer',exact:true}).click();await page.getByRole('button',{name:'Confirm pause timer'}).click();await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(db.prepare('SELECT count(*) AS n FROM running_timers').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM time_entries WHERE id=?').get(running.session_id).n,1);
 await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/^Expense/}).click();await page.getByLabel('Description',{exact:true}).fill('Proxy smoke supplies');await page.getByLabel('Amount ($)').fill('25');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.reload();await page.getByText('$109.60',{exact:true}).waitFor();
 assert.deepEqual(errors,[],'Browser console/CSP errors');
 const preview=await context.newPage();await preview.goto('http://127.0.0.1:4173/?demo=1');await preview.getByRole('heading',{name:'Today.',exact:true}).waitFor();assert(await preview.getByText('$84.60',{exact:true}).isVisible());await preview.reload();assert(await preview.getByText('$84.60',{exact:true}).isVisible());
 console.log('PASS: sealed backend + built frontend + real Caddy; page/asset/API gate, private404s, CSP, sign-in, timer across backend restart, pause once, purchase/reload, pnpm preview demo.');
}finally{if(browser)await browser.close();caddy.kill('SIGTERM');await new Promise(r=>caddy.once('exit',r));await app.close();db.close();await rm(dir,{recursive:true,force:true});}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createFixture, type Fixture } from '../helpers/fixture.js';
import { readFileSync } from 'node:fs';
import { appStateSchema } from '@pirata/domain/domain/schema';
import { convertLegacy, executeImport, previewImport } from '../../src/integration/import.js';
import { readSnapshot } from '../../src/core/snapshot.js';
import { revision } from '../../src/core/commands.js';
import { TABLES } from '../../src/core/repositories.js';
import { capabilities } from '../../src/modules/index.js';
import { toLegacyState } from '@pirata/contracts/compatibility';
import { snapshotSchema } from '@pirata/contracts/index';
import { materialShortages, spendingTotal } from '@pirata/domain/domain/selectors';
import { businessDate } from '@pirata/domain/lib/dates';
import { backup, restoreToScratch } from '../../src/db/backup.js';
import { openDatabase } from '../../src/db/database.js';
const now=Date.parse('2026-09-17T14:00:00Z');
let f:Fixture;
beforeEach(async()=>{f=await createFixture({now:()=>now});});afterEach(async()=>{await f.close();});
const source=()=>appStateSchema.parse(JSON.parse(readFileSync(new URL('./demo-v1.json',import.meta.url),'utf8')));
const request=()=>({state:source(),timerChoice:'discard' as const,requestId:randomUUID(),baseRevision:0,confirmed:true as const});
const previewInput=(r:ReturnType<typeof request>)=>({state:r.state,timerChoice:r.timerChoice});
const snapshot=()=>readSnapshot(f.db,f.ownerId,capabilities,now);
it('preview has counts, warnings and no writes; import preserves records and stable financial/stock totals',()=>{
 const input=request(),before=JSON.stringify(input.state);const preview=previewImport(f.db,f.ownerId,previewInput(input),now);
 expect(preview.counts).toMatchObject({projects:2,clients:2,tasks:4,expenses:2,equipment:1});expect(preview.warnings.join(' ')).toContain('fabricated');expect(snapshot().tasks).toEqual([]);
 expect(executeImport(f.db,f.ownerId,input,now).revision).toBe(1);const saved=snapshotSchema.parse(snapshot()),legacy=toLegacyState(saved);
 expect(saved.tasks[0].id).toBe('t-prep');expect(saved.tasks[0].createdAt).toBe(input.state.tasks[0].createdAt);expect(saved.timeEntries[0]).toMatchObject(input.state.timeEntries[0]);expect(spendingTotal(legacy,businessDate(now))).toBe(8460);expect(materialShortages(legacy)[0].missingMinor).toBe(300);expect(JSON.stringify(input.state)).toBe(before);
});
it('rejects unknown schema, bad relationships and duplicate requirement pairs without modifying state',()=>{
 const input=request();expect(()=>previewImport(f.db,f.ownerId,{...input,state:{...input.state,schemaVersion:9}} as never,now)).toThrow();
 input.state.tasks[0].projectId='missing';expect(()=>previewImport(f.db,f.ownerId,previewInput(input),now)).toThrow();
 const duplicate=request();duplicate.state.materialRequirements.push({...duplicate.state.materialRequirements[1],id:'duplicate'});expect(()=>previewImport(f.db,f.ownerId,previewInput(duplicate),now)).toThrow(/Multiple requirements/);expect(snapshot().materials).toEqual([]);expect(revision(f.db,f.ownerId)).toBe(0);
});
it('explicitly maps equal names to distinct clients/equipment, normalizes ranks and maps colliding follow-up IDs',()=>{
 const input=request();input.state.projects[1].clientName=input.state.projects[0].clientName;
 input.state.maintenance.push({...input.state.maintenance[0],id:'other-maintenance'});
 input.state.objectives.forEach(o=>o.rank=19);
 const follow={id:'old-follow',at:now-1,note:'Called'};input.state.leads[0].followUps=[follow];input.state.leads.push({...input.state.leads[0],id:'other-lead',followUps:[follow]});
 const mapped=convertLegacy(previewInput(input),now);expect(new Set(mapped.clients.map(c=>c.id)).size).toBe(2);expect(new Set(mapped.equipment.map(e=>e.id)).size).toBe(2);expect(mapped.objectives.map(o=>o.rank)).toEqual([0,1,2]);expect(new Set(mapped.leads.flatMap(l=>l.followUps.map(p=>p.id))).size).toBe(2);
 executeImport(f.db,f.ownerId,input,now);expect(snapshot().leads).toHaveLength(2);
});
it('copies adjustment history without applying its quantity twice',()=>{const input=request();input.state.materials[0].stockMinor=500;input.state.materialAdjustments=[{id:'a1',materialId:'m-paint',deltaMinor:300,reason:'restock',note:'Earlier restock',createdAt:now-1}];executeImport(f.db,f.ownerId,input,now);expect(snapshot().materials[0].stockMinor).toBe(500);expect(snapshot().materialAdjustments).toHaveLength(1);});
it('requires explicit timer choice and handles carry/discard without fabricated time',()=>{const input=request();input.state.runningTimer={taskId:'t-prep',sessionId:'active-session',startedAt:now-10000};expect(()=>convertLegacy({state:input.state} as never,now)).toThrow();expect(convertLegacy({...previewInput(input),timerChoice:'carry'},now).runningTimer).toEqual(input.state.runningTimer);expect(convertLegacy(previewInput(input),now).runningTimer).toBeNull();expect(convertLegacy(previewInput(input),now).timeEntries).toHaveLength(1);input.state.runningTimer.startedAt=now+1;expect(()=>convertLegacy({...previewInput(input),timerChoice:'carry'},now)).toThrow(/future/);expect(convertLegacy(previewInput(input),now).runningTimer).toBeNull();});
it('same import request replays after restart and later edits; changed payload under same ID conflicts',async()=>{
 const input=request(),result=executeImport(f.db,f.ownerId,input,now);expect(executeImport(f.db,f.ownerId,input,now+100)).toEqual(result);
 const second=openDatabase(f.path);try{expect(executeImport(second,f.ownerId,input,now+200)).toEqual(result);}finally{second.close();}
 f.repo.update('tasks','t-prep',{title:'Later edit',updatedAt:now});expect(executeImport(f.db,f.ownerId,input,now)).toEqual(result);expect(snapshot().tasks[0].title).toBe('Later edit');expect(()=>executeImport(f.db,f.ownerId,{...input,timerChoice:'carry'},now)).toThrow(/already used/);
});
it('nonempty workspace rejects new import; preview revision does not authorize a later overwrite',()=>{
 const input=request();previewImport(f.db,f.ownerId,previewInput(input),now);f.repo.insert('clients',{id:'client',name:'Existing',phone:'',email:'',note:'',archivedAt:null,createdAt:now,updatedAt:now});expect(()=>executeImport(f.db,f.ownerId,input,now)).toThrow(/empty workspace/);expect(snapshot().clients[0].name).toBe('Existing');expect(snapshot().tasks).toHaveLength(0);
 f.db.prepare('UPDATE data_revisions SET revision=1 WHERE owner_id=?').run(f.ownerId);expect(()=>executeImport(f.db,f.ownerId,input,now)).toThrow(/changed/);
});
it('a late failed insertion rolls back every record, revision and receipt',()=>{
 f.db.exec("CREATE TRIGGER fail_import BEFORE INSERT ON leads BEGIN SELECT RAISE(ABORT,'injected late failure'); END;");expect(()=>executeImport(f.db,f.ownerId,request(),now)).toThrow();for(const table of TABLES)expect(f.repo.list(table)).toEqual([]);expect(revision(f.db,f.ownerId)).toBe(0);expect(f.db.prepare('SELECT * FROM command_receipts').all()).toEqual([]);
});
describe('HTTP boundaries',()=>{
 it('requires owner authentication and exact Origin/CSRF on both import routes',async()=>{const headers=await f.authenticate();for(const url of ['/api/v1/import/preview','/api/v1/import']){expect((await f.app.inject({method:'POST',url,payload:request()})).statusCode).toBe(401);expect((await f.app.inject({method:'POST',url,headers:{...headers,origin:'https://evil.test'},payload:request()})).statusCode).toBe(403);expect((await f.app.inject({method:'POST',url,headers:{...headers,'x-csrf-token':''},payload:request()})).statusCode).toBe(403);}});
 it('checks confirmation and bounded size, returns a schema-validated credential-free export',async()=>{const headers=await f.authenticate(),input=request();expect((await f.app.inject({method:'POST',url:'/api/v1/import',headers,payload:{...input,confirmed:false}})).statusCode).toBe(400);expect((await f.app.inject({method:'POST',url:'/api/v1/import',headers,payload:{...input,padding:'x'.repeat(2*1024*1024)}})).statusCode).toBe(413);expect((await f.app.inject({method:'POST',url:'/api/v1/import',headers,payload:input})).statusCode).toBe(200);const response=await f.app.inject({url:'/api/v1/export',headers});expect(snapshotSchema.safeParse(response.json()).success).toBe(true);expect(response.body).not.toMatch(/password_hash|csrfToken|token_hash|owner_id/);});
});
it('backs up imported records with WAL, restores in isolation and preserves active timer after reopening',async()=>{
 const input=request();input.state.runningTimer={taskId:'t-prep',sessionId:'active-session',startedAt:now-10000};executeImport(f.db,f.ownerId,{...input,timerChoice:'carry'},now);
 const dest=join(f.directory,'backup.sqlite'),restored=join(f.directory,'scratch.sqlite');await backup(f.db,dest);await restoreToScratch(dest,restored);const db=openDatabase(restored);try{expect(readSnapshot(db,f.ownerId,capabilities,now)).toEqual(snapshot());}finally{db.close();}
});

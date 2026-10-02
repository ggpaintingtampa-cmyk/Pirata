import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createFixture, type Fixture } from './helpers/fixture.js';
import { userOf, runAs, type Headers } from './helpers/roles.js';
let f:Fixture,owner:Headers,projectId:string,journalId:string,noteId:string;
const secret='Private journal sentinel only the primary owner may read';
beforeEach(async()=>{
  f=await createFixture();owner=await f.authenticate();
  const client=(await runAs(f,owner,{type:'client.create',name:'Synthetic privacy client',phone:'',email:'',note:''})).json().result.id;
  projectId=(await runAs(f,owner,{type:'project.create',name:'Privacy project',clientId:client,clientName:'',address:'',note:''})).json().result.id;
  journalId=(await runAs(f,owner,{type:'journal.save',projectId,body:secret})).json().result.id;
  noteId=(await runAs(f,owner,{type:'note.save',projectId,title:'Public paint note',body:'Shared paint details'})).json().result.id;
  expect((await f.app.inject({method:'POST',url:'/api/v1/translations/correct',headers:owner,payload:{kind:'projectNote',id:journalId,field:'body',target:'es',text:'Texto privado del diario'}})).statusCode).toBe(200);
});
afterEach(async()=>{await f.close();});

for(const role of ['worker','sales','manager','owner'] as const) it(`keeps existing journals private from another ${role} across all access paths`,async()=>{
  const user=await userOf(f,role,owner);
  // An entry's previous author never overrides its new primary-owner-only visibility.
  f.repo.update('project_notes',journalId,{createdBy:user.id});
  const snap=await f.app.inject({url:'/api/v1/snapshot',headers:user.headers});
  expect(snap.json().projectJournalsVisible).toBe(false);
  expect(snap.body).not.toContain(journalId);expect(snap.body).not.toContain(secret);expect(snap.body).not.toContain('journal.save');
  expect(snap.json().projectNotes.map((n:{id:string})=>n.id)).toContain(noteId);
  const primary=await f.app.inject({url:'/api/v1/snapshot',headers:owner});
  expect(primary.json().projectJournalsVisible).toBe(true);expect(primary.body).toContain(secret);
  expect((await runAs(f,user.headers,{type:'journal.save',projectId,body:'Not allowed'})).statusCode).toBe(403);
  expect((await runAs(f,user.headers,{type:'journal.save',id:journalId,projectId,body:'Overwrite'})).statusCode).toBe(403);
  expect((await runAs(f,user.headers,{type:'record.delete',kind:'projectNote',id:journalId})).statusCode).toBe(404);
  expect((await runAs(f,user.headers,{type:'shopping.add',title:'Copy',sourceNoteId:journalId,projectId})).statusCode).toBe(403);
  const search=await f.app.inject({url:'/api/v1/search?q=sentinel&locale=en',headers:user.headers});
  expect(search.json().results).toEqual([]);
  for(const route of ['lookup','translate']){
    const translated=await f.app.inject({method:'POST',url:'/api/v1/translations/'+route,headers:user.headers,payload:{target:'es',items:[{kind:'projectNote',id:journalId,field:'body'}]}});
    expect(translated.body).not.toContain(secret);expect(translated.body).not.toContain('Texto privado');
    expect(translated.json().items[0].status).toBe('unavailable');
  }
  expect((await f.app.inject({method:'POST',url:'/api/v1/translations/correct',headers:user.headers,payload:{kind:'projectNote',id:journalId,field:'body',target:'es',text:'Overwrite'}})).statusCode).toBe(404);
  const requestId=randomUUID();
  f.db.prepare("INSERT INTO ai_usage (id,owner_id,user_id,created_at,status,reserved_cents,kind,response_json) VALUES (?,?,?,?,'complete',0,'ask',?)").run(requestId,f.ownerId,user.id,Date.now(),JSON.stringify({message:'Found records',records:{notes:[f.repo.require('project_notes',journalId),f.repo.require('project_notes',noteId)]}}));
  const replay=await f.app.inject({method:'POST',url:'/api/v1/ask',headers:user.headers,payload:{requestId,prompt:'Find notes'}});
  expect(replay.statusCode).toBe(200);expect(replay.body).not.toContain(secret);expect(replay.body).not.toContain(journalId);expect(replay.body).toContain(noteId);
  const exported=await f.app.inject({url:'/api/v1/export',headers:user.headers});
  expect(exported.body).not.toContain(secret);
  await runAs(f,owner,{type:'record.delete',kind:'projectNote',id:journalId});
  const deleted=await f.app.inject({url:'/api/v1/snapshot',headers:user.headers});
  expect(deleted.body).not.toContain(journalId);expect(deleted.body).not.toContain('journal.delete');
  expect([403,404]).toContain((await runAs(f,user.headers,{type:'record.restore',kind:'projectNote',id:journalId})).statusCode);
  expect((await runAs(f,owner,{type:'record.restore',kind:'projectNote',id:journalId})).statusCode).toBe(200);
  expect((await f.app.inject({url:'/api/v1/snapshot',headers:owner})).body).toContain(secret);
});

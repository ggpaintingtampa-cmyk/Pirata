import { afterEach, describe, expect, it } from 'vitest';
import type { CommandHandler } from '../src/core/context.js';
import { createFixture, type Fixture } from './helpers/fixture.js';

const fixtures:Fixture[]=[];
const command={type:'client.create' as const,name:'Transaction guard fixture',phone:'',email:'',note:''};
afterEach(async()=>{for(const fixture of fixtures.splice(0))await fixture.close();});

async function submit(handler:CommandHandler<'client.create'>) {
  const fixture=await createFixture({handlers:{'client.create':handler}});
  fixtures.push(fixture);
  const response=await fixture.app.inject({method:'POST',url:'/api/v1/commands',headers:await fixture.authenticate(),payload:fixture.envelope(command)});
  return {fixture,response};
}
function expectUnchanged(fixture:Fixture) {
  expect(fixture.repo.list('clients')).toEqual([]);
  expect(fixture.db.prepare('SELECT revision FROM data_revisions WHERE owner_id=?').get(fixture.ownerId)).toEqual({revision:0});
  expect(fixture.db.prepare('SELECT * FROM command_receipts').all()).toEqual([]);
}
const insert:CommandHandler<'client.create'>=(ctx,input)=>{
  const id=ctx.newId();
  ctx.repo.insert('clients',{id,name:input.name,phone:input.phone,email:input.email,note:input.note,archivedAt:null,createdAt:ctx.serverNow,updatedAt:ctx.serverNow});
  return {changed:true,result:{kind:'client',id}};
};

describe('transaction handler contract guards',()=>{
  it('rolls back business writes when a handler falsely declares no change',async()=>{
    const {fixture,response}=await submit((ctx,input)=>({...insert(ctx,input),changed:false}));
    expect(response.statusCode).toBe(503);
    expectUnchanged(fixture);
  });

  it('rejects changed=true without any business write instead of inventing a revision',async()=>{
    const {fixture,response}=await submit(()=>({changed:true,result:{kind:'client'}}));
    expect(response.statusCode).toBe(503);
    expectUnchanged(fixture);
  });

  it('accepts a real no-op without incrementing revision and replays its receipt',async()=>{
    const fixture=await createFixture({handlers:{'client.create':()=>({changed:false,result:{kind:'noop'}})}});
    fixtures.push(fixture);
    const headers=await fixture.authenticate(),envelope=fixture.envelope(command);
    const first=await fixture.app.inject({method:'POST',url:'/api/v1/commands',headers,payload:envelope});
    const replay=await fixture.app.inject({method:'POST',url:'/api/v1/commands',headers,payload:envelope});
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({changed:false,revision:0});
    expect(replay.json()).toEqual(first.json());
    expect(fixture.db.prepare('SELECT * FROM command_receipts').all()).toHaveLength(1);
    expect(fixture.repo.list('clients')).toEqual([]);
  });

  it('rejects a declared async handler before its body can retain or mutate context',async()=>{
    let called=false;
    const asyncHandler:unknown=async (...args:Parameters<typeof insert>)=>{called=true;await Promise.resolve();return insert(...args);};
    const {fixture,response}=await submit(asyncHandler as CommandHandler<'client.create'>);
    await Promise.resolve();
    expect(response.statusCode).toBe(503);
    expect(called).toBe(false);
    expectUnchanged(fixture);
  });

  it('rolls back a disguised thenable handler and denies writes from its late continuation',async()=>{
    let continuation:Promise<void>|undefined;
    let lateWriteDenied=false;
    const disguised:unknown=(...args:Parameters<typeof insert>)=>{
      insert(...args);
      continuation=Promise.resolve().then(()=>{
        try {insert(...args);} catch {lateWriteDenied=true;}
      });
      return continuation.then(()=>({changed:true,result:{kind:'client'}}));
    };
    const {fixture,response}=await submit(disguised as CommandHandler<'client.create'>);
    await continuation;
    expect(response.statusCode).toBe(503);
    expect(lateWriteDenied).toBe(true);
    expectUnchanged(fixture);
  });

  it('expires the context after a successful command so retained repositories cannot write later',async()=>{
    let retainedInsert:(()=>void)|undefined;
    const {fixture,response}=await submit((...args)=>{
      retainedInsert=()=>{insert(...args);};
      return insert(...args);
    });
    expect(response.statusCode).toBe(200);
    expect(()=>retainedInsert!()).toThrow();
    expect(fixture.repo.list('clients')).toHaveLength(1);
    expect(fixture.db.prepare('SELECT revision FROM data_revisions WHERE owner_id=?').get(fixture.ownerId)).toEqual({revision:1});
  });
});

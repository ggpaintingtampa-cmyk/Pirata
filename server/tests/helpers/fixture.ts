import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import type { BusinessCommand, MutationRequest } from '@pirata/contracts/index';
import { openDatabase } from '../../src/db/database.js';
import { setOwnerPassword } from '../../src/auth/password.js';
import { createApp, type AppOptions } from '../../src/app.js';
import { COOKIE_NAME } from '../../src/auth/sessions.js';
import { Repositories } from '../../src/core/repositories.js';
export const TEST_ORIGIN='https://pirata.test';
export async function createFixture(options:Omit<Partial<AppOptions>,'db'>={}){
  const directory=mkdtempSync(join(tmpdir(),'pirata-test-')),path=join(directory,'test.sqlite');
  const db=openDatabase(path,{create:true}),password=randomBytes(24).toString('base64url'),ownerId=await setOwnerPassword(db,password,'setup');
  const app=createApp({db,origin:TEST_ORIGIN,...options});await app.ready();
  async function authenticate(){const pre=await app.inject({url:'/api/v1/session'});const preCookie=pre.cookies.find(c=>c.name===COOKIE_NAME)!;const response=await app.inject({method:'POST',url:'/api/v1/login',headers:{origin:options.origin??TEST_ORIGIN,'x-csrf-token':pre.json().csrfToken,cookie:COOKIE_NAME+'='+preCookie.value},payload:{password}});if(response.statusCode!==200)throw new Error('Fixture login failed');return {cookie:COOKIE_NAME+'='+response.cookies.find(c=>c.name===COOKIE_NAME)!.value,origin:options.origin??TEST_ORIGIN,'x-csrf-token':response.json().csrfToken as string};}
  return {directory,path,db,app,password,ownerId,repo:new Repositories(db,ownerId),authenticate,
    envelope(command:BusinessCommand,baseRevision=0,requestId=randomUUID()):MutationRequest{return {command,baseRevision,requestId};},
    async close(){await app.close();if(db.open)db.close();rmSync(directory,{recursive:true,force:true});}};
}
export type Fixture=Awaited<ReturnType<typeof createFixture>>;

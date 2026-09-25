import { randomUUID } from 'node:crypto';
import type { Role } from '@pirata/contracts/permissions';
import { COOKIE_NAME } from '../../src/auth/sessions.js';
import { TEST_ORIGIN, type Fixture } from './fixture.js';
export type Headers=Record<string,string>;
/** Create a team member of the given role through the owner's admin API and sign them in. */
export async function userOf(f:Fixture,role:Role,owner:Headers,username=role+randomUUID().slice(0,6)):Promise<{id:string;headers:Headers;password:string}> {
  const password=randomUUID()+'-'+role;
  const create=await f.app.inject({method:'POST',url:'/api/v1/admin/team',headers:owner,payload:{name:role[0].toUpperCase()+role.slice(1),username,password,role}});
  if(create.statusCode!==200)throw new Error('Could not create '+role+': '+create.body);
  const pre=await f.app.inject({url:'/api/v1/session'});
  const login=await f.app.inject({method:'POST',url:'/api/v1/login',headers:{origin:TEST_ORIGIN,cookie:COOKIE_NAME+'='+pre.cookies[0].value,'x-csrf-token':pre.json().csrfToken},payload:{username,password}});
  if(login.statusCode!==200)throw new Error('Could not sign in '+role);
  return {id:create.json().id,password,headers:{origin:TEST_ORIGIN,cookie:COOKIE_NAME+'='+login.cookies[0].value,'x-csrf-token':login.json().csrfToken}};
}
/** Send a command as the given user against the current revision. */
export async function runAs(f:Fixture,headers:Headers,command:unknown){const snap=await f.app.inject({url:'/api/v1/snapshot',headers});return f.app.inject({method:'POST',url:'/api/v1/commands',headers,payload:{requestId:randomUUID(),baseRevision:snap.json().revision,command}});}

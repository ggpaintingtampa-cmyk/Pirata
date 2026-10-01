import Fastify from 'fastify';
import {registerFiles} from './files/index.js';
import {registerAsk} from './ai/index.js';
import {registerTeam} from './auth/team.js';
import {Repositories} from './core/repositories.js';
import cookie from '@fastify/cookie';
import { importInputSchema, importRequestSchema } from '@pirata/contracts/import';
import { previewImport, executeImport } from './integration/import.js';
import { z } from 'zod';
import { mutationRequestSchema } from '@pirata/contracts/index';
import type { Sqlite } from './db/database.js';
import { handlers, capabilities } from './modules/index.js';
import type { PartialHandlers } from './core/context.js';
import { ApiError } from './core/errors.js';
import { executeCommand } from './core/commands.js';
import { readSnapshot } from './core/snapshot.js';
import { checkMutation, clearSessionCookie, findSession, newSession, rateLimit, requireOwner, requireSession, revokeSession, touchSession } from './auth/sessions.js';
import { verifyPassword } from './auth/password.js';
import { registerExports } from './routes/export.js';
import { registerSearch } from './routes/search.js';
import { registerTrashPreview } from './routes/trash.js';
import { registerWorkFeed } from './integration/work-feed.js';
import { registerTranslation } from './translation/index.js';
import type { TranslationService } from './translation/service.js';
export interface AppOptions {storagePath?:string;storageLimitBytes?:number;fetcher?:typeof fetch;db:Sqlite;origin:string;now?:()=>number;audit?:(event:{event:'request';method:string;status:number})=>void;handlers?:PartialHandlers;translation?:TranslationService}
export function createApp(options:AppOptions) {
  const {db,origin}=options,now=options.now??Date.now;
  if(new URL(origin).origin!==origin)throw new Error('Origin must be an exact URL origin.');
  const app=Fastify({logger:false,trustProxy:false,bodyLimit:65536,requestTimeout:120000});
  app.register(cookie);
  app.addHook('onSend',async(_req,reply,payload)=>{reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff');return payload;});
  app.addHook('onResponse',async(req,reply)=>{options.audit?.({event:'request',method:req.method,status:reply.statusCode});});
  app.setErrorHandler((error,_request,reply)=>{
    if(error instanceof ApiError)return reply.code(error.status).send(error.body);
    if(error instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_INPUT',message:'Check the submitted fields.',fields:Object.fromEntries(error.issues.map(i=>[i.path.join('.'),i.message]))}});
    const e=error as {code?:string;statusCode?:number};
    if(e.code?.startsWith('SQLITE_CONSTRAINT'))return reply.code(409).send({error:{code:'CONFLICT',message:'This change conflicts with saved records.'}});
    if(e.statusCode===413)return reply.code(413).send({error:{code:'TOO_LARGE',message:'Request too large.'}});
    if(e.statusCode===400||e.statusCode===415)return reply.code(400).send({error:{code:'INVALID_INPUT',message:'Invalid request body.'}});
    return reply.code(503).send({error:{code:'STORAGE_UNAVAILABLE',message:'Could not save or load data. Keep your draft and try again.'}});
  });
  app.get('/api/v1/health',async()=>({status:'ok'}));
  app.get('/api/v1/session',async(req,reply)=>{
    let s=findSession(db,req,now());
    if(!s){rateLimit(db,'session:'+req.ip,now(),60);s=newSession(db,reply,null,now());}else touchSession(db,req,reply,s,now());
    return {authenticated:!!s.owner_id,csrfToken:s.csrf_token,expiresAt:s.expires_at,...(s.owner_id?{user:new Repositories(db,s.owner_id).team().find(m=>m.id===s.user_id)}:{})};
  });
  app.post('/api/v1/login',async(req,reply)=>{
    const session=findSession(db,req,now());checkMutation(req,session,origin);
    rateLimit(db,'login:'+req.ip,now(),10);rateLimit(db,'login:global',now(),100);
    const {password,username}=z.object({password:z.string().min(1).max(128),username:z.string().trim().toLowerCase().max(40).default('owner')}).strict().parse(req.body);
    const owner=db.prepare('SELECT id,owner_id,password_hash FROM team_members WHERE username=? AND disabled_at IS NULL').get(username) as {id:string;owner_id:string;password_hash:string}|undefined;
    if(!owner||!await verifyPassword(owner.password_hash,password))throw new ApiError(401,'INVALID_CREDENTIALS','Unable to sign in.');
    // Recovery or logout may occur during async hashing. Recheck both before rotation.
    return db.transaction(()=>{
      const current=db.prepare('SELECT password_hash FROM team_members WHERE id=? AND disabled_at IS NULL').get(owner.id) as {password_hash:string}|undefined;
      if(current?.password_hash!==owner.password_hash||!findSession(db,req,now()))throw new ApiError(401,'INVALID_CREDENTIALS','Unable to sign in.');
      revokeSession(db,session!);const s=newSession(db,reply,owner.owner_id,now(),owner.id);
      return {authenticated:true,csrfToken:s.csrf_token,expiresAt:s.expires_at,user:new Repositories(db,owner.owner_id).team().find(m=>m.id===owner.id)};
    }).immediate();
  });
  app.post('/api/v1/logout',async(req,reply)=>{
    const s=requireSession(db,req,now());checkMutation(req,s,origin);
    z.object({}).strict().parse(req.body??{});revokeSession(db,s);
    clearSessionCookie(reply);return reply.code(204).send();
  });
  app.get('/api/v1/snapshot',async(req)=>{const s=requireSession(db,req,now());return readSnapshot(db,s.owner_id,capabilities,now(),s.user_id,s.role);});
  app.get('/api/v1/export',async(req,reply)=>{const s=requireOwner(db,req,now());reply.header('Content-Disposition','attachment; filename="pirata-business-v2.json"');return readSnapshot(db,s.owner_id,capabilities,now(),s.user_id,s.role);});
  app.post('/api/v1/commands',async(req)=>{
    const s=requireSession(db,req,now());checkMutation(req,s,origin);
    const request=mutationRequestSchema.parse(req.body);
    return executeCommand(db,s.owner_id,request,options.handlers??handlers,now,s.user_id,s.role);
  });
  app.post('/api/v1/import/preview',{bodyLimit:2*1024*1024},async(req)=>{
    const s=requireOwner(db,req,now());checkMutation(req,s,origin);
    return previewImport(db,s.owner_id,importInputSchema.parse(req.body),now());
  });
  app.post('/api/v1/import',{bodyLimit:2*1024*1024},async(req)=>{
    const s=requireOwner(db,req,now());checkMutation(req,s,origin);
    return executeImport(db,s.owner_id,importRequestSchema.parse(req.body),now());
  });
  registerTeam(app,{db,origin,now});
  registerFiles(app,{db,origin,now,storagePath:options.storagePath??process.env.PIRATA_UPLOADS_PATH,storageLimitBytes:options.storageLimitBytes??Number(process.env.PIRATA_STORAGE_LIMIT_BYTES??2147483648)});
  registerAsk(app,{db,origin,now,fetcher:options.fetcher});
  const translation=registerTranslation(app,{db,origin,now,fetcher:options.fetcher,service:options.translation});
  registerExports(app,{db,now,translation});
  registerSearch(app,{db,now});
  registerTrashPreview(app,{db,origin,now});
  registerWorkFeed(app,{db,origin,now});
  return app;
}

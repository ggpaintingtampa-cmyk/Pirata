import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Sqlite } from '../db/database.js';
import { ApiError } from '../core/errors.js';
export const COOKIE_NAME='__Host-pirata_session';
export const SESSION_TTL=12*60*60*1000;
export const PREAUTH_TTL=10*60*1000;
export interface Session {token_hash:string;owner_id:string|null;user_id:string|null;role?:'owner'|'employee';csrf_token:string;created_at:number;expires_at:number}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function findSession(db:Sqlite,request:FastifyRequest,now:number):Session|undefined {
  const token=request.cookies[COOKIE_NAME];if(!token||!/^[-\w]{43}$/.test(token))return;
  return db.prepare('SELECT s.*,m.role FROM sessions s LEFT JOIN team_members m ON m.id=s.user_id WHERE token_hash=? AND expires_at>? AND (s.owner_id IS NULL OR (m.id IS NOT NULL AND m.disabled_at IS NULL))').get(digest(token),now) as Session|undefined;
}
export function newSession(db:Sqlite,reply:FastifyReply,ownerId:string|null,now:number,userId:string|null=ownerId):Session {
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url'),ttl=ownerId?SESSION_TTL:PREAUTH_TTL;
  const session={token_hash:digest(token),owner_id:ownerId,user_id:userId,csrf_token:csrf,created_at:now,expires_at:now+ttl};
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
  db.prepare('INSERT INTO sessions (token_hash,owner_id,csrf_token,created_at,expires_at,user_id) VALUES (@token_hash,@owner_id,@csrf_token,@created_at,@expires_at,@user_id)').run(session);
  reply.setCookie(COOKIE_NAME,token,{secure:true,httpOnly:true,sameSite:'strict',path:'/',maxAge:ttl/1000,expires:new Date(now+ttl)});
  return session;
}
export function requireSession(db:Sqlite,request:FastifyRequest,now:number):Session&{owner_id:string;user_id:string;role:'owner'|'employee'} {const s=findSession(db,request,now);if(!s?.owner_id||!s.user_id)throw new ApiError(401,'UNAUTHENTICATED','Sign in required.');return s as Session&{owner_id:string;user_id:string;role:'owner'|'employee'};}
export function requireOwner(db:Sqlite,request:FastifyRequest,now:number){const s=requireSession(db,request,now);if(s.role!=='owner')throw new ApiError(403,'FORBIDDEN','Only the owner can access this information.');return s;}
export function checkMutation(request:FastifyRequest,session:Session|undefined,origin:string):void {
  const csrf=request.headers['x-csrf-token'];
  if(request.headers.origin!==origin||!session||typeof csrf!=='string'||Buffer.byteLength(csrf)!==Buffer.byteLength(session.csrf_token)||!timingSafeEqual(Buffer.from(csrf),Buffer.from(session.csrf_token)))throw new ApiError(403,'CSRF_REJECTED','Refresh this page before submitting.');
  if(request.headers['sec-fetch-site']==='cross-site')throw new ApiError(403,'CSRF_REJECTED','Cross-site request rejected.');
}
export function revokeSession(db:Sqlite,session:Session):void{db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash);}
/** Fixed-window IP and global limits persist across restarts. No submitted strings are stored. */
export function rateLimit(db:Sqlite,bucket:string,now:number,max:number,window=15*60*1000):void {
  const allowed=db.transaction(()=>{
    db.prepare('DELETE FROM auth_rate_limits WHERE window_start<?').run(now-window);
    const key=digest(bucket),row=db.prepare('SELECT attempts FROM auth_rate_limits WHERE bucket=?').get(key) as {attempts:number}|undefined;
    if((row?.attempts??0)>=max)return false;
    db.prepare('INSERT INTO auth_rate_limits (bucket,attempts,window_start) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1').run(key,now);return true;
  }).immediate();
  if(!allowed)throw new ApiError(429,'RATE_LIMITED','Too many attempts. Try again later.');
}

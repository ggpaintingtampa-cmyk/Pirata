// Chunk D owns this file. Foundation registered the commands as stubs; `user.setLocale` is complete (keep it as is).
import type { HandlerMap } from '../../core/context.js';
import { notImplemented } from '../../core/errors.js';
export const handlers={
  'materialRequest.create':()=>notImplemented(),
  'materialRequest.update':()=>notImplemented(),
  'materialRequest.setReceived':()=>notImplemented(),
  'materialRequest.remove':()=>notImplemented(),
  'tool.signOut':()=>notImplemented(),
  'tool.return':()=>notImplemented(),
  'equipment.setSignOutRequired':()=>notImplemented(),
  'equipment.reportBroken':()=>notImplemented(),
  'equipment.resolveReport':()=>notImplemented(),
  'user.setLocale':(ctx,c)=>{
    const current=ctx.repo.team().find(m=>m.id===ctx.userId);
    if((current?.locale??'en')===c.locale)return {changed:false,result:{kind:'user',id:ctx.userId}};
    ctx.repo.setLocale(c.locale,ctx.serverNow);
    return {changed:true,result:{kind:'user',id:ctx.userId}};
  },
} satisfies Pick<HandlerMap,'materialRequest.create'|'materialRequest.update'|'materialRequest.setReceived'|'materialRequest.remove'|'tool.signOut'|'tool.return'|'equipment.setSignOutRequired'|'equipment.reportBroken'|'equipment.resolveReport'|'user.setLocale'>;

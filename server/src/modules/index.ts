// Coordinator-owned: explicit, exhaustive module registration.
import * as m0 from './clients-projects/index.js';
import * as m1 from './tasks-time/index.js';
import * as m2 from './planning/index.js';
import * as m3 from './spending/index.js';
import * as m5 from './collaboration/index.js';
import * as m4 from './inventory/index.js';
import type { HandlerMap } from '../core/context.js';
import type { Capabilities } from '@pirata/contracts/index';
export const handlers={...m0.handlers,...m1.handlers,...m2.handlers,...m3.handlers,...m4.handlers,...m5.handlers,'settings.update':(ctx,c)=>{const old=ctx.repo.settings().workdayEndMinute;if(old===c.workdayEndMinute)return {changed:false,result:{kind:'settings'}};ctx.repo.setSettings(c.workdayEndMinute);return {changed:true,result:{kind:'settings'}}}} satisfies HandlerMap;
export const capabilities={'clients-projects':m0.capability,'tasks-time':m1.capability,'planning':m2.capability,'spending':m3.capability,'inventory':m4.capability} satisfies Capabilities;

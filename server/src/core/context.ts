import type { BusinessCommand, CommandOf, CommandType, Role } from '@pirata/contracts/index';
import type { Repositories } from './repositories.js';
export interface TransactionContext {readonly ownerId:string;readonly userId:string;readonly role:Role;readonly serverNow:number;readonly revision:number;readonly repo:Repositories;newId():string}
export interface HandlerResult {changed:boolean;result:{kind:string;id?:string}}
export type CommandHandler<T extends CommandType=CommandType>=(ctx:TransactionContext,command:CommandOf<T>)=>HandlerResult;
export type HandlerMap = {[T in CommandType]:CommandHandler<T>};
export type PartialHandlers = Partial<HandlerMap>;
export function invokeHandler(handlers:PartialHandlers,ctx:TransactionContext,command:BusinessCommand):HandlerResult {
  const handler=handlers[command.type] as CommandHandler|undefined;
  if(!handler)throw new Error('Unregistered command');
  if(handler.constructor.name==='AsyncFunction')throw new Error('Transaction handlers must be synchronous');
  const result=handler(ctx,command);
  if(result&&typeof result==='object'&&'then' in result){void Promise.resolve(result).catch(()=>{});throw new Error('Transaction handlers must be synchronous');}
  return result;
}

import type * as D from '@pirata/contracts/index';
import type { Sqlite } from '../db/database.js';
import { notFound } from './errors.js';
export interface Tables {clients:D.Client;projects:D.Project;tasks:D.Task;objectives:D.Objective;schedule_blocks:D.ScheduleBlock;time_entries:D.TimeEntry;expenses:D.Expense;materials:D.Material;material_requirements:D.MaterialRequirement;material_adjustments:D.MaterialAdjustment;equipment:D.Equipment;maintenance_items:D.MaintenanceItem;leads:D.LeadRecord;lead_follow_ups:D.LeadFollowUp;daily_goals:D.DailyGoal;task_templates:D.TaskTemplate;attachments:D.StoredAttachment;activity:D.Activity;project_notes:D.ProjectNote;shopping_items:D.ShoppingItem;cleanup_obligations:D.CleanupObligation;cleanup_snoozes:D.CleanupSnooze;day_assignments:D.DayAssignment;task_questions:D.TaskQuestion;day_notes:D.DayNote;project_templates:D.ProjectTemplate;project_facts:D.ProjectFact;pay_rates:D.PayRate;work_shifts:D.WorkShift;tool_sign_outs:D.ToolSignOut;equipment_reports:D.EquipmentReport;attachment_tags:D.AttachmentTag;attachment_comments:D.AttachmentComment}
export type TableName=keyof Tables;
export type MutablePatch<T> = T extends unknown ? Partial<Omit<T,'id'|'createdAt'>> : never;
export const TABLES:TableName[]=['clients','projects','tasks','objectives','schedule_blocks','time_entries','expenses','materials','material_requirements','material_adjustments','equipment','maintenance_items','leads','lead_follow_ups','daily_goals','task_templates','attachments','activity','project_notes','shopping_items','cleanup_obligations','cleanup_snoozes','day_assignments','task_questions','day_notes','project_templates','project_facts','pay_rates','work_shifts','tool_sign_outs','equipment_reports','attachment_tags','attachment_comments'];
const snake=(s:string)=>s.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
const camel=(s:string)=>s.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase());
function decode<T>(raw:unknown):T {
  const record=raw as Record<string,unknown>;
  return Object.fromEntries(Object.entries(record).filter(([key,v])=>key!=='owner_id'&&!(record.source==='timer'&&['date','duration_seconds'].includes(key))&&!(record.source==='manual'&&['started_at','ended_at'].includes(key))&&v!==undefined).map(([k,v])=>[camel(k),v])) as T;
}
/** These repositories capture ownerId; no public method can change ownership or commit. */
export class Repositories {
  readonly #db:Sqlite;readonly #ownerId:string;readonly #active:()=>boolean;readonly #userId:string;
  constructor(db:Sqlite,ownerId:string,active:()=>boolean=()=>true,userId=ownerId){this.#db=db;this.#ownerId=ownerId;this.#active=active;this.#userId=userId;}
  #assertActive(){if(!this.#active())throw new Error('Transaction context is no longer active');}
  #table(table:TableName){this.#assertActive();if(!TABLES.includes(table))throw new Error('Unknown table');return table;}
  #columns(table:TableName,record:object){const allowed=new Set((this.#db.prepare(`PRAGMA table_info(${this.#table(table)})`).all() as {name:string}[]).map(c=>c.name));const keys=Object.keys(record).map(snake);if(keys.some(k=>k==='owner_id'||!allowed.has(k)))throw new Error('Unknown record field');return keys;}
  list<K extends TableName>(table:K):Tables[K][]{return this.#db.prepare(`SELECT * FROM ${this.#table(table)} WHERE owner_id=? ORDER BY created_at,id`).all(this.#ownerId).map(r=>decode<Tables[K]>(r));}
  get<K extends TableName>(table:K,id:string):Tables[K]|undefined {const row=this.#db.prepare(`SELECT * FROM ${this.#table(table)} WHERE owner_id=? AND id=?`).get(this.#ownerId,id);return row?decode<Tables[K]>(row):undefined;}
  require<K extends TableName>(table:K,id:string):Tables[K]{return this.get(table,id)??notFound();}
  insert<K extends TableName>(table:K,record:Tables[K]):void {if(table==='time_entries')record={...record,userId:this.#userId};const keys=this.#columns(table,record);this.#db.prepare(`INSERT INTO ${this.#table(table)} (owner_id,${keys.join(',')}) VALUES (?,${keys.map(()=>'?').join(',')})`).run(this.#ownerId,...Object.values(record));}
  update<K extends TableName>(table:K,id:string,patch:MutablePatch<Tables[K]>):void {
    this.require(table,id);const keys=this.#columns(table,patch);if(keys.includes('id')||keys.includes('created_at'))throw new Error('Immutable identity');if(!keys.length)return;
    this.#db.prepare(`UPDATE ${this.#table(table)} SET ${keys.map(k=>k+'=?').join(',')} WHERE owner_id=? AND id=?`).run(...Object.values(patch),this.#ownerId,id);
  }
  remove(table:'objectives'|'schedule_blocks'|'material_requirements'|'daily_goals'|'day_assignments'|'work_shifts'|'pay_rates'|'project_facts'|'attachment_tags',id:string):void {if(!['objectives','schedule_blocks','material_requirements','daily_goals','day_assignments','work_shifts','pay_rates','project_facts','attachment_tags'].includes(table))throw new Error('Hard deletion forbidden');this.require(table,id);this.#db.prepare(`DELETE FROM ${table} WHERE owner_id=? AND id=?`).run(this.#ownerId,id);}
  team():D.TeamMember[] {this.#assertActive();return this.#db.prepare('SELECT id,name,username,role,disabled_at,locale FROM team_members WHERE owner_id=? ORDER BY created_at,id').all(this.#ownerId).map(r=>decode<D.TeamMember>(r));}
  settings(){this.#assertActive();const row=this.#db.prepare('SELECT workday_end_minute FROM business_settings WHERE owner_id=?').get(this.#ownerId) as {workday_end_minute:number}|undefined;return {workdayEndMinute:row?.workday_end_minute??1020,timezone:'America/New_York' as const};}
  setSettings(workdayEndMinute:number){this.#assertActive();this.#db.prepare('INSERT INTO business_settings VALUES (?,?) ON CONFLICT(owner_id) DO UPDATE SET workday_end_minute=excluded.workday_end_minute').run(this.#ownerId,workdayEndMinute);}
  /** The signed-in person's own language preference. */
  setLocale(locale:'en'|'es',now:number):void {this.#assertActive();this.#db.prepare('UPDATE team_members SET locale=?,updated_at=? WHERE owner_id=? AND id=?').run(locale,now,this.#ownerId,this.#userId);}
  listTimers():(D.RunningTimer & {userId:string})[] {this.#assertActive();return this.#db.prepare('SELECT user_id,session_id,task_id,started_at FROM running_timers WHERE owner_id=?').all(this.#ownerId).map(r=>decode<D.RunningTimer & {userId:string}>(r));}
  getTimer():D.RunningTimer|null {this.#assertActive();const row=this.#db.prepare('SELECT session_id,task_id,started_at FROM running_timers WHERE owner_id=? AND user_id=?').get(this.#ownerId,this.#userId);return row?decode<D.RunningTimer>(row):null;}
  insertTimer(timer:D.RunningTimer):void {this.#assertActive();this.#db.prepare('INSERT INTO running_timers (owner_id,user_id,session_id,task_id,started_at) VALUES (?,?,?,?,?)').run(this.#ownerId,this.#userId,timer.sessionId,timer.taskId,timer.startedAt);}
  correctTimerStart(startedAt:number):void {this.#assertActive();this.#db.prepare('UPDATE running_timers SET started_at=? WHERE owner_id=? AND user_id=?').run(startedAt,this.#ownerId,this.#userId);}
  removeTimer():void {this.#assertActive();this.#db.prepare('DELETE FROM running_timers WHERE owner_id=? AND user_id=?').run(this.#ownerId,this.#userId);}
}

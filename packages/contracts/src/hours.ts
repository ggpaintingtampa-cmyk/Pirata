import { z } from 'zod';
import { isLocalDate } from '@pirata/domain/lib/dates';
// Chunk B contracts: work shifts (hours for pay), pay rates, end-of-day notes.
const id=z.string().min(1).max(100), nullableId=id.nullable(), stamp=z.number().int().nonnegative(), safeInteger=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const dateSchema=z.string().refine(isLocalDate,'Enter a valid calendar date.');
const record={id,createdAt:stamp,updatedAt:stamp};
const command=<T extends string,S extends z.ZodRawShape>(type:T,fields:S)=>z.object({type:z.literal(type),...fields}).strict();

/** A "day" of work for pay purposes; also converts day-shifts to minutes for hour summaries. */
export const STANDARD_DAY_MINUTES=480;
export const DAY_UNITS=[25,50,75,100,150,200] as const;
const shiftFields={
 projectId:id,date:dateSchema,kind:z.enum(['hours','day']),
 startMinute:z.number().int().min(0).max(1439).nullable().default(null),endMinute:z.number().int().min(1).max(1440).nullable().default(null),
 breakMinutes:z.number().int().min(0).max(600).default(0),
 daysMinor:z.union([z.literal(25),z.literal(50),z.literal(75),z.literal(100),z.literal(150),z.literal(200)]).nullable().default(null),
 note:z.string().trim().max(1000).default(''),
};
export const hoursCommands=[
 command('shift.submit',shiftFields),
 command('shift.enter',{userId:id,...shiftFields}),
 command('shift.update',{id,...shiftFields}),
 command('shift.approve',{id}),
 command('shift.reject',{id,note:z.string().trim().min(1).max(1000)}),
 command('shift.remove',{id}),
 command('payRate.set',{userId:id,kind:z.enum(['hourly','daily']),amountCents:safeInteger,effectiveFrom:dateSchema}),
 command('payRate.remove',{id}),
 command('dayNote.save',{date:dateSchema,body:z.string().trim().max(4000)}),
] as const;

export const workShiftSchema=z.object({...record,userId:id,projectId:id,date:z.string(),kind:z.enum(['hours','day']),startMinute:z.number().nullable(),endMinute:z.number().nullable(),breakMinutes:z.number(),daysMinor:z.number().nullable(),minutes:z.number(),note:z.string(),status:z.enum(['submitted','approved','rejected']),submittedBy:id,approvedBy:nullableId,approvedAt:stamp.nullable(),decisionNote:z.string()}).strict();
export type WorkShift=z.infer<typeof workShiftSchema>;
export const payRateSchema=z.object({...record,userId:id,kind:z.enum(['hourly','daily']),amountCents:z.number(),effectiveFrom:z.string(),createdBy:id}).strict();
export type PayRate=z.infer<typeof payRateSchema>;
export const dayNoteSchema=z.object({...record,userId:id,date:z.string(),body:z.string()}).strict();
export type DayNote=z.infer<typeof dayNoteSchema>;
export const hoursSnapshot={workShifts:z.array(workShiftSchema).optional(),payRates:z.array(payRateSchema).optional(),dayNotes:z.array(dayNoteSchema).optional()};
export interface HoursSnapshot {workShifts?:WorkShift[];payRates?:PayRate[];dayNotes?:DayNote[]}

// Pure helpers (unit-tested in server/tests/contracts-helpers.test.ts).
export function shiftMinutes(s:{kind:'hours'|'day';startMinute:number|null;endMinute:number|null;breakMinutes:number;daysMinor:number|null}):number {
 if(s.kind==='hours'){if(s.startMinute===null||s.endMinute===null)return 0;return Math.max(0,s.endMinute-s.startMinute-s.breakMinutes);}
 return Math.round(((s.daysMinor??0)/100)*STANDARD_DAY_MINUTES);
}
/** The rate in effect on a date: latest effectiveFrom <= date. */
export function rateFor(rates:readonly PayRate[],userId:string,date:string):PayRate|undefined {
 return rates.filter(r=>r.userId===userId&&r.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.createdAt-a.createdAt)[0];
}
export function shiftCostCents(shift:Pick<WorkShift,'minutes'>,rate:PayRate|undefined):number {
 if(!rate)return 0;
 return rate.kind==='hourly'?Math.round(rate.amountCents*shift.minutes/60):Math.round(rate.amountCents*shift.minutes/STANDARD_DAY_MINUTES);
}
/** Approved shifts only. Dates are inclusive YYYY-MM-DD strings. */
export function laborCostCents(shifts:readonly WorkShift[],rates:readonly PayRate[],filter:{projectId?:string;userId?:string;from?:string;to?:string}={}):number {
 return shifts.filter(s=>s.status==='approved'&&(!filter.projectId||s.projectId===filter.projectId)&&(!filter.userId||s.userId===filter.userId)&&(!filter.from||s.date>=filter.from)&&(!filter.to||s.date<=filter.to))
  .reduce((sum,s)=>sum+shiftCostCents(s,rateFor(rates,s.userId,s.date)),0);
}
/** Monday..Sunday containing the date (calendar-date arithmetic; no timezone conversion). */
export function weekBounds(date:string):{from:string;to:string} {
 const day=new Date(date+'T00:00:00Z'),offset=(day.getUTCDay()+6)%7;
 const from=new Date(day);from.setUTCDate(day.getUTCDate()-offset);
 const to=new Date(from);to.setUTCDate(from.getUTCDate()+6);
 return {from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10)};
}
export function monthBounds(date:string):{from:string;to:string} {
 const [y,m]=date.split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).getUTCDate();
 return {from:`${date.slice(0,7)}-01`,to:`${date.slice(0,7)}-${String(last).padStart(2,'0')}`};
}

// Chunk B: work shifts (hours for pay) with approval, pay rates (owner), end-of-day notes.
import { can, shiftMinutes, type WorkShift } from '@pirata/contracts/index';
import type { HandlerMap, TransactionContext } from '../../core/context.js';
import { ApiError, invalid } from '../../core/errors.js';
const result = (kind: string, id?: string, changed = true) => ({ changed, result: { kind, ...(id ? { id } : {}) } });
const forbidden = (message: string): never => { throw new ApiError(403, 'FORBIDDEN', message); };
type ShiftFields = { projectId: string; date: string; kind: 'hours' | 'day'; startMinute: number | null; endMinute: number | null; breakMinutes: number; daysMinor: number | null; note: string };
/** Validate the fields of a shift and derive its minutes. A project in draft has no crew yet. */
function shiftPatch(ctx: TransactionContext, fields: ShiftFields) {
  const project = ctx.repo.require('projects', fields.projectId);
  if (project.status === 'draft') invalid('Hours go on sold or scheduled projects.', { projectId: 'This project is still a draft.' });
  if (fields.kind === 'hours') {
    if (fields.startMinute === null || fields.endMinute === null) invalid('Enter the in and out times.', { startMinute: 'Required for hours.' });
    if (fields.daysMinor !== null) invalid('Hours and days cannot be mixed in one entry.');
  } else {
    if (fields.daysMinor === null) invalid('Choose how many days.', { daysMinor: 'Required for days.' });
    if (fields.startMinute !== null || fields.endMinute !== null) invalid('Hours and days cannot be mixed in one entry.');
  }
  const minutes = shiftMinutes(fields);
  if (minutes < 1) invalid('The shift must be at least one minute after breaks.', { endMinute: 'Out must be later than in, after the break.' });
  return { projectId: fields.projectId, date: fields.date, kind: fields.kind, startMinute: fields.startMinute, endMinute: fields.endMinute, breakMinutes: fields.breakMinutes, daysMinor: fields.daysMinor, minutes, note: fields.note };
}
const approver = (ctx: TransactionContext) => can(ctx.role, 'shift.approve');
export const handlers = {
  'shift.submit': (ctx, c) => {
    const { type: _, ...fields } = c; void _;
    const id = ctx.newId();
    ctx.repo.insert('work_shifts', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, userId: ctx.userId, ...shiftPatch(ctx, fields), status: 'submitted', submittedBy: ctx.userId, approvedBy: null, approvedAt: null, decisionNote: '' });
    return result('shift', id);
  },
  'shift.enter': (ctx, c) => {
    const { type: _, userId, ...fields } = c; void _;
    if (!ctx.repo.team().some(member => member.id === userId && !member.disabledAt)) invalid('Choose an active team member.', { userId: 'This person is unavailable.' });
    const id = ctx.newId();
    ctx.repo.insert('work_shifts', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, userId, ...shiftPatch(ctx, fields), status: 'approved', submittedBy: ctx.userId, approvedBy: ctx.userId, approvedAt: ctx.serverNow, decisionNote: '' });
    return result('shift', id);
  },
  'shift.update': (ctx, c) => {
    const shift = ctx.repo.require('work_shifts', c.id);
    if (!approver(ctx) && !(shift.userId === ctx.userId && shift.status === 'submitted')) forbidden('Only a manager or owner can change this entry now.');
    const { type: _, id, ...fields } = c; void _;
    const patch = shiftPatch(ctx, fields);
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(key => shift[key as keyof WorkShift] !== patch[key]);
    if (changed) ctx.repo.update('work_shifts', id, { ...patch, updatedAt: ctx.serverNow });
    return result('shift', id, changed);
  },
  'shift.approve': (ctx, c) => {
    const shift = ctx.repo.require('work_shifts', c.id);
    if (shift.status === 'approved') return result('shift', c.id, false);
    ctx.repo.update('work_shifts', c.id, { status: 'approved', approvedBy: ctx.userId, approvedAt: ctx.serverNow, decisionNote: '', updatedAt: ctx.serverNow });
    return result('shift', c.id);
  },
  'shift.reject': (ctx, c) => {
    const shift = ctx.repo.require('work_shifts', c.id);
    if (shift.status === 'rejected' && shift.decisionNote === c.note) return result('shift', c.id, false);
    ctx.repo.update('work_shifts', c.id, { status: 'rejected', approvedBy: ctx.userId, approvedAt: ctx.serverNow, decisionNote: c.note, updatedAt: ctx.serverNow });
    return result('shift', c.id);
  },
  'shift.remove': (ctx, c) => {
    const shift = ctx.repo.require('work_shifts', c.id);
    if (!approver(ctx) && !(shift.userId === ctx.userId && shift.status === 'submitted')) forbidden('Only a manager or owner can remove this entry now.');
    ctx.repo.remove('work_shifts', c.id);
    return result('shift', c.id);
  },
  'payRate.set': (ctx, c) => {
    if (!ctx.repo.team().some(member => member.id === c.userId)) invalid('Choose a team member.', { userId: 'Unknown person.' });
    const existing = ctx.repo.list('pay_rates').find(rate => rate.userId === c.userId && rate.effectiveFrom === c.effectiveFrom);
    if (existing) {
      if (existing.kind === c.kind && existing.amountCents === c.amountCents) return result('payRate', existing.id, false);
      ctx.repo.update('pay_rates', existing.id, { kind: c.kind, amountCents: c.amountCents, updatedAt: ctx.serverNow });
      return result('payRate', existing.id);
    }
    const id = ctx.newId();
    ctx.repo.insert('pay_rates', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, userId: c.userId, kind: c.kind, amountCents: c.amountCents, effectiveFrom: c.effectiveFrom, createdBy: ctx.userId });
    return result('payRate', id);
  },
  'payRate.remove': (ctx, c) => { ctx.repo.require('pay_rates', c.id); ctx.repo.remove('pay_rates', c.id); return result('payRate', c.id); },
  'dayNote.save': (ctx, c) => {
    const existing = ctx.repo.list('day_notes').find(note => note.userId === ctx.userId && note.date === c.date);
    if (existing) {
      if (existing.body === c.body) return result('dayNote', existing.id, false);
      ctx.repo.update('day_notes', existing.id, { body: c.body, updatedAt: ctx.serverNow });
      return result('dayNote', existing.id);
    }
    if (!c.body) return result('dayNote', undefined, false);
    const id = ctx.newId();
    ctx.repo.insert('day_notes', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, userId: ctx.userId, date: c.date, body: c.body });
    return result('dayNote', id);
  },
} satisfies Pick<HandlerMap, 'shift.submit' | 'shift.enter' | 'shift.update' | 'shift.approve' | 'shift.reject' | 'shift.remove' | 'payRate.set' | 'payRate.remove' | 'dayNote.save'>;

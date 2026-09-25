// Chunk D: material requests (shopping_items), tool sign-outs with per-user cleaning reminders, broken reports, locale.
import { isOfficeRole } from '@pirata/contracts/index';
import type { HandlerMap, TransactionContext } from '../../core/context.js';
import { ApiError, conflict, invalid } from '../../core/errors.js';
import { openCleanupCycle } from '../collaboration/index.js';
const result = (kind: string, id?: string, changed = true) => ({ changed, result: { kind, ...(id ? { id } : {}) } });
const forbidden = (message: string): never => { throw new ApiError(403, 'FORBIDDEN', message); };
const record = (ctx: TransactionContext) => ({ id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
function ownRequest(ctx: TransactionContext, id: string) {
  const item = ctx.repo.require('shopping_items', id);
  if (item.archivedAt) invalid('This request was removed.');
  if (item.createdBy !== ctx.userId && !isOfficeRole(ctx.role)) forbidden('Only the requester or the office can change this request.');
  return item;
}
function activeTool(ctx: TransactionContext, id: string) {
  const tool = ctx.repo.require('equipment', id);
  if (tool.archivedAt !== null) invalid('Restore this equipment first.');
  return tool;
}
export const handlers = {
  'materialRequest.create': (ctx, c) => {
    if (!c.projectId && !c.taskId && !c.forUserId) invalid('Tie the request to a project, a task or a person.', { projectId: 'Choose a project, a task or a person.' });
    const task = c.taskId ? ctx.repo.require('tasks', c.taskId) : null;
    if (task && c.projectId && task.projectId !== c.projectId) invalid('The task belongs to a different project.');
    const projectId = task?.projectId ?? c.projectId ?? null;
    if (projectId) ctx.repo.require('projects', projectId);
    if (c.forUserId && !ctx.repo.team().some(member => member.id === c.forUserId)) invalid('Choose a team member.', { forUserId: 'Unknown person.' });
    const item = { ...record(ctx), title: c.title, note: c.note, projectId, sourceNoteId: null, checkedAt: null, createdBy: ctx.userId, quantity: c.quantity, taskId: c.taskId, forUserId: c.forUserId, receivedAt: null, receivedBy: null, archivedAt: null };
    ctx.repo.insert('shopping_items', item);
    return result('materialRequest', item.id);
  },
  'materialRequest.update': (ctx, c) => {
    const item = ownRequest(ctx, c.id);
    const patch = { title: c.title, quantity: c.quantity, note: c.note };
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(key => item[key] !== patch[key]);
    if (changed) ctx.repo.update('shopping_items', c.id, { ...patch, updatedAt: ctx.serverNow });
    return result('materialRequest', c.id, changed);
  },
  'materialRequest.setReceived': (ctx, c) => {
    const item = ownRequest(ctx, c.id);
    if (Boolean(item.receivedAt) === c.received) return result('materialRequest', c.id, false);
    ctx.repo.update('shopping_items', c.id, { receivedAt: c.received ? ctx.serverNow : null, receivedBy: c.received ? ctx.userId : null, checkedAt: c.received ? ctx.serverNow : null, updatedAt: ctx.serverNow });
    return result('materialRequest', c.id);
  },
  'materialRequest.remove': (ctx, c) => {
    ownRequest(ctx, c.id);
    ctx.repo.update('shopping_items', c.id, { archivedAt: ctx.serverNow, updatedAt: ctx.serverNow });
    return result('materialRequest', c.id);
  },
  'tool.signOut': (ctx, c) => {
    const tool = activeTool(ctx, c.equipmentId);
    if (c.projectId) ctx.repo.require('projects', c.projectId);
    const open = ctx.repo.list('tool_sign_outs').find(row => row.equipmentId === tool.id && row.returnedAt === null);
    if (open) conflict('This tool is already signed out. Return it first.', 'TOOL_OUT');
    const takenAt = c.takenAt ?? ctx.serverNow;
    if (takenAt > ctx.serverNow) invalid('The time taken cannot be in the future.', { takenAt: 'Choose a past time.' });
    const item = { ...record(ctx), equipmentId: tool.id, takenBy: ctx.userId, takenAt, projectId: c.projectId, returnedAt: null, returnedBy: null, note: c.note };
    ctx.repo.insert('tool_sign_outs', item);
    ctx.repo.insert('activity', { ...record(ctx), userId: ctx.userId, projectId: c.projectId, taskId: null, kind: 'tool.signOut', body: `Took ${tool.name}.` });
    openCleanupCycle(ctx, tool, null);
    return result('toolSignOut', item.id);
  },
  'tool.return': (ctx, c) => {
    const item = ctx.repo.require('tool_sign_outs', c.id);
    if (item.returnedAt !== null) return result('toolSignOut', c.id, false);
    if (item.takenBy !== ctx.userId && !isOfficeRole(ctx.role)) forbidden('Only the person who took the tool or the office can return it.');
    const returnedAt = c.returnedAt ?? ctx.serverNow;
    if (returnedAt < item.takenAt) invalid('Return time cannot be before the time taken.', { returnedAt: 'Choose a later time.' });
    ctx.repo.update('tool_sign_outs', c.id, { returnedAt, returnedBy: ctx.userId, updatedAt: ctx.serverNow });
    const tool = ctx.repo.require('equipment', item.equipmentId);
    ctx.repo.insert('activity', { ...record(ctx), userId: ctx.userId, projectId: item.projectId, taskId: null, kind: 'tool.return', body: `Returned ${tool.name}.` });
    return result('toolSignOut', c.id);
  },
  'equipment.setSignOutRequired': (ctx, c) => {
    const tool = ctx.repo.require('equipment', c.id);
    if (Boolean(tool.requiresSignOut) === c.required) return result('equipment', c.id, false);
    ctx.repo.update('equipment', c.id, { requiresSignOut: c.required ? 1 : 0, updatedAt: ctx.serverNow });
    return result('equipment', c.id);
  },
  'equipment.reportBroken': (ctx, c) => {
    const tool = activeTool(ctx, c.id);
    if (c.attachmentId) { const file = ctx.repo.require('attachments', c.attachmentId); if (file.removedAt !== null) invalid('Choose an available photo.'); }
    const report = { ...record(ctx), equipmentId: tool.id, reportedBy: ctx.userId, body: c.body, attachmentId: c.attachmentId, resolvedAt: null, resolvedBy: null };
    ctx.repo.insert('equipment_reports', report);
    if (tool.status !== 'broken') ctx.repo.update('equipment', tool.id, { status: 'broken', updatedAt: ctx.serverNow });
    return result('equipmentReport', report.id);
  },
  'equipment.resolveReport': (ctx, c) => {
    const report = ctx.repo.require('equipment_reports', c.id);
    if (report.resolvedAt !== null) return result('equipmentReport', c.id, false);
    ctx.repo.update('equipment_reports', c.id, { resolvedAt: ctx.serverNow, resolvedBy: ctx.userId, updatedAt: ctx.serverNow });
    if (!ctx.repo.list('equipment_reports').some(row => row.equipmentId === report.equipmentId && row.resolvedAt === null && row.id !== c.id)) ctx.repo.update('equipment', report.equipmentId, { status: 'ok', updatedAt: ctx.serverNow });
    return result('equipmentReport', c.id);
  },
  'user.setLocale': (ctx, c) => {
    const current = ctx.repo.team().find(m => m.id === ctx.userId);
    if ((current?.locale ?? 'en') === c.locale) return { changed: false, result: { kind: 'user', id: ctx.userId } };
    ctx.repo.setLocale(c.locale, ctx.serverNow);
    return { changed: true, result: { kind: 'user', id: ctx.userId } };
  },
} satisfies Pick<HandlerMap, 'materialRequest.create' | 'materialRequest.update' | 'materialRequest.setReceived' | 'materialRequest.remove' | 'tool.signOut' | 'tool.return' | 'equipment.setSignOutRequired' | 'equipment.reportBroken' | 'equipment.resolveReport' | 'user.setLocale'>;

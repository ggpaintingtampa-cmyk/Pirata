import type { HandlerMap, HandlerResult, TransactionContext } from '../../core/context.js';
import { PROJECT_TRANSITIONS, can, isOfficeRole } from '@pirata/contracts/index';
import { ApiError } from '../../core/errors.js';
const forbidden = (message: string): never => { throw new ApiError(403, 'FORBIDDEN', message); };
import { conflict, invalid } from '../../core/errors.js';

export const capability: 'blocked' | 'ready' = 'ready';
const record = (ctx: TransactionContext) => ({ id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
const result = (kind: string, id: string, changed = true): HandlerResult => ({ changed, result: { kind, id } });
function differs<T extends object>(previous: T, patch: Partial<T>): boolean {
  return (Object.keys(patch) as (keyof T)[]).some(key => previous[key] !== patch[key]);
}

export const handlers = {
  'client.create': (ctx, c) => {
    const client = { ...record(ctx), name: c.name, phone: c.phone, email: c.email, note: c.note, archivedAt: null };
    ctx.repo.insert('clients', client);
    return result('client', client.id);
  },
  'client.update': (ctx, c) => {
    const previous = ctx.repo.require('clients', c.id);
    const patch = { name: c.name, phone: c.phone, email: c.email, note: c.note };
    const changed = differs(previous, patch);
    if (changed) ctx.repo.update('clients', c.id, { ...patch, updatedAt: ctx.serverNow });
    return result('client', c.id, changed);
  },
  'client.archive': (ctx, c) => {
    const previous = ctx.repo.require('clients', c.id);
    const changed = (previous.archivedAt !== null) !== c.archived;
    if (changed) ctx.repo.update('clients', c.id, { archivedAt: c.archived ? ctx.serverNow : null, updatedAt: ctx.serverNow });
    return result('client', c.id, changed);
  },
  'project.create': (ctx, c) => {
    // Linked clients supply their own display name. Unlinked imported names are retained.
    const clientName = c.clientId === null ? c.clientName : ctx.repo.require('clients', c.clientId).name;
    if (!can(ctx.role, 'money.sales') && (c.salesPriceCents != null || c.materialsPriceCents != null || c.laborPriceCents != null)) forbidden('Only the office can set prices.');
    // A sales rep's project starts as a draft and goes through review; the office's own projects are scheduled at once.
    const status = ctx.role === 'sales' ? 'draft' as const : 'scheduled' as const;
    const project = { ...record(ctx), name: c.name, clientId: c.clientId, clientName, address: c.address, note: c.note, status, startDate: c.startDate ?? null, endDate: c.endDate ?? null, salesPriceCents: c.salesPriceCents ?? null, materialsPriceCents: c.materialsPriceCents ?? null, laborPriceCents: c.laborPriceCents ?? null, salesNote: c.salesNote ?? '', salesRepId: ctx.userId, reviewNote: '', soldAt: null, scheduledAt: status === 'scheduled' ? ctx.serverNow : null, completedAt: null };
    ctx.repo.insert('projects', project);
    return result('project', project.id);
  },
  'project.update': (ctx, c) => {
    const previous = ctx.repo.require('projects', c.id);
    const linkedClient = c.clientId === null ? null : ctx.repo.require('clients', c.clientId);
    const clientName = c.clientId === previous.clientId && c.clientId !== null
      ? previous.clientName
      : linkedClient?.name ?? c.clientName;
    if (previous.status === 'completed' && !isOfficeRole(ctx.role)) forbidden('Only the office can edit a completed project.');
    const sales = can(ctx.role, 'money.sales');
    if (!sales && ((c.salesPriceCents !== undefined && c.salesPriceCents !== (previous.salesPriceCents ?? null)) || (c.materialsPriceCents !== undefined && c.materialsPriceCents !== (previous.materialsPriceCents ?? null)) || (c.laborPriceCents !== undefined && c.laborPriceCents !== (previous.laborPriceCents ?? null)) || (c.salesNote !== undefined && c.salesNote !== (previous.salesNote ?? '')))) forbidden('Only the office can change prices.');
    const patch = { name: c.name, clientId: c.clientId, clientName, address: c.address, note: c.note, startDate: c.startDate === undefined ? previous.startDate ?? null : c.startDate, endDate: c.endDate === undefined ? previous.endDate ?? null : c.endDate, ...(sales ? { salesPriceCents: c.salesPriceCents === undefined ? previous.salesPriceCents ?? null : c.salesPriceCents, materialsPriceCents: c.materialsPriceCents === undefined ? previous.materialsPriceCents ?? null : c.materialsPriceCents, laborPriceCents: c.laborPriceCents === undefined ? previous.laborPriceCents ?? null : c.laborPriceCents, salesNote: c.salesNote === undefined ? previous.salesNote ?? '' : c.salesNote } : {}) };
    const changed = differs(previous, patch);
    if (changed) ctx.repo.update('projects', c.id, { ...patch, updatedAt: ctx.serverNow });
    return result('project', c.id, changed);
  },
  'project.setStatus': (ctx, c) => {
    const previous = ctx.repo.require('projects', c.id);
    if (previous.status === c.status) return result('project', c.id, false);
    if (!PROJECT_TRANSITIONS[previous.status].includes(c.status)) invalid(`A ${previous.status} project cannot become ${c.status}.`, { status: 'Not allowed from ' + previous.status + '.' });
    if (previous.status === 'sold' && !can(ctx.role, 'project.review')) forbidden('Only a manager or owner reviews sold projects.');
    if (c.status === 'draft' && !(c.note ?? '').trim()) invalid('Say why the project goes back to the sales rep.', { note: 'A note is required.' });
    // Project status never mutates its work, timer, expenses or stock reservations.
    ctx.repo.update('projects', c.id, { status: c.status, updatedAt: ctx.serverNow, ...(c.status === 'sold' ? { soldAt: ctx.serverNow, reviewNote: '' } : {}), ...(c.status === 'scheduled' ? { scheduledAt: ctx.serverNow, completedAt: null } : {}), ...(c.status === 'draft' ? { reviewNote: (c.note ?? '').trim() } : {}), ...(c.status === 'completed' ? { completedAt: ctx.serverNow } : {}) });
    return result('project', c.id);
  },
  'lead.create': (ctx, c) => {
    const lead = { ...record(ctx), name: c.name, phone: c.phone, email: c.email, workDescription: c.workDescription, nextFollowUpDate: c.nextFollowUpDate, convertedClientId: null };
    ctx.repo.insert('leads', lead);
    return result('lead', lead.id);
  },
  'lead.update': (ctx, c) => {
    const previous = ctx.repo.require('leads', c.id);
    const patch = { name: c.name, phone: c.phone, email: c.email, workDescription: c.workDescription, nextFollowUpDate: c.nextFollowUpDate };
    const changed = differs(previous, patch);
    if (changed) ctx.repo.update('leads', c.id, { ...patch, updatedAt: ctx.serverNow });
    return result('lead', c.id, changed);
  },
  'lead.followUp': (ctx, c) => {
    ctx.repo.require('leads', c.id);
    ctx.repo.insert('lead_follow_ups', { ...record(ctx), leadId: c.id, at: ctx.serverNow, note: c.note });
    ctx.repo.update('leads', c.id, { nextFollowUpDate: c.nextFollowUpDate, updatedAt: ctx.serverNow });
    return result('lead', c.id);
  },
  'lead.convertToClient': (ctx, c) => {
    const lead = ctx.repo.require('leads', c.id);
    if (c.clientId !== null) ctx.repo.require('clients', c.clientId);
    if (lead.convertedClientId !== null) {
      if (c.clientId !== null && c.clientId !== lead.convertedClientId) conflict('This lead is already linked to a different client.');
      return result('client', lead.convertedClientId, false);
    }
    let clientId = c.clientId;
    if (clientId === null) {
      const client = { ...record(ctx), name: lead.name, phone: lead.phone, email: lead.email, note: lead.workDescription, archivedAt: null };
      ctx.repo.insert('clients', client);
      clientId = client.id;
    }
    ctx.repo.update('leads', c.id, { convertedClientId: clientId, updatedAt: ctx.serverNow });
    return result('client', clientId);
  },
} satisfies Pick<HandlerMap, 'client.create' | 'client.update' | 'client.archive' | 'project.create' | 'project.update' | 'project.setStatus' | 'lead.create' | 'lead.update' | 'lead.followUp' | 'lead.convertToClient'>;

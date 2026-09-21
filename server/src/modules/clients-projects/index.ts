import type { HandlerMap, HandlerResult, TransactionContext } from '../../core/context.js';
import { conflict } from '../../core/errors.js';

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
    const project = { ...record(ctx), name: c.name, clientId: c.clientId, clientName, address: c.address, note: c.note, status: 'open' as const };
    ctx.repo.insert('projects', project);
    return result('project', project.id);
  },
  'project.update': (ctx, c) => {
    const previous = ctx.repo.require('projects', c.id);
    const linkedClient = c.clientId === null ? null : ctx.repo.require('clients', c.clientId);
    const clientName = c.clientId === previous.clientId && c.clientId !== null
      ? previous.clientName
      : linkedClient?.name ?? c.clientName;
    const patch = { name: c.name, clientId: c.clientId, clientName, address: c.address, note: c.note };
    const changed = differs(previous, patch);
    if (changed) ctx.repo.update('projects', c.id, { ...patch, updatedAt: ctx.serverNow });
    return result('project', c.id, changed);
  },
  'project.setStatus': (ctx, c) => {
    const previous = ctx.repo.require('projects', c.id);
    const changed = previous.status !== c.status;
    // Project status never mutates its work, timer, expenses or stock reservations.
    if (changed) ctx.repo.update('projects', c.id, { status: c.status, updatedAt: ctx.serverNow });
    return result('project', c.id, changed);
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

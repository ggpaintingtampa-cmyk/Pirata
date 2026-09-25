// Chunk C: job facts, file tags and comments.
import { can } from '@pirata/contracts/index';
import type { HandlerMap, TransactionContext } from '../../core/context.js';
import { ApiError, invalid } from '../../core/errors.js';
const result = (kind: string, id?: string, changed = true) => ({ changed, result: { kind, ...(id ? { id } : {}) } });
const forbidden = (message: string): never => { throw new ApiError(403, 'FORBIDDEN', message); };
function liveAttachment(ctx: TransactionContext, id: string) {
  const file = ctx.repo.require('attachments', id);
  if (file.removedAt !== null) invalid('Restore this file before tagging or commenting on it.');
  return file;
}
export const handlers = {
  'projectFact.save': (ctx, c) => {
    ctx.repo.require('projects', c.projectId);
    const office = can(ctx.role, 'facts.hidden');
    if (!c.workerVisible && !office) forbidden('Only the office can hide a fact from workers.');
    const existing = c.id ? ctx.repo.require('project_facts', c.id) : undefined;
    if (existing) {
      if (existing.projectId !== c.projectId) invalid('A fact belongs to one project.');
      if (!existing.workerVisible && !office) forbidden('Only the office can change a hidden fact.');
      const patch = { key: c.key, label: c.label, value: c.value, workerVisible: c.workerVisible ? 1 : 0, position: c.position };
      const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(key => existing[key] !== patch[key]);
      if (changed) ctx.repo.update('project_facts', existing.id, { ...patch, updatedAt: ctx.serverNow });
      return result('projectFact', existing.id, changed);
    }
    const id = ctx.newId();
    ctx.repo.insert('project_facts', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, projectId: c.projectId, key: c.key, label: c.label, value: c.value, workerVisible: c.workerVisible ? 1 : 0, position: c.position, createdBy: ctx.userId });
    return result('projectFact', id);
  },
  'projectFact.remove': (ctx, c) => {
    const fact = ctx.repo.require('project_facts', c.id);
    if (!fact.workerVisible && !can(ctx.role, 'facts.hidden')) forbidden('Only the office can remove a hidden fact.');
    ctx.repo.remove('project_facts', c.id);
    return result('projectFact', c.id);
  },
  'attachment.tag': (ctx, c) => {
    liveAttachment(ctx, c.attachmentId);
    const tag = c.tag.toLocaleLowerCase(), existing = ctx.repo.list('attachment_tags').find(row => row.attachmentId === c.attachmentId && row.tag === tag);
    if (c.add) {
      if (existing) return result('attachmentTag', existing.id, false);
      const id = ctx.newId();
      ctx.repo.insert('attachment_tags', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, attachmentId: c.attachmentId, tag, createdBy: ctx.userId });
      return result('attachmentTag', id);
    }
    if (!existing) return result('attachmentTag', undefined, false);
    ctx.repo.remove('attachment_tags', existing.id);
    return result('attachmentTag', existing.id);
  },
  'attachment.comment': (ctx, c) => {
    liveAttachment(ctx, c.attachmentId);
    const id = ctx.newId();
    ctx.repo.insert('attachment_comments', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, attachmentId: c.attachmentId, userId: ctx.userId, body: c.body });
    return result('attachmentComment', id);
  },
} satisfies Pick<HandlerMap, 'projectFact.save' | 'projectFact.remove' | 'attachment.tag' | 'attachment.comment'>;

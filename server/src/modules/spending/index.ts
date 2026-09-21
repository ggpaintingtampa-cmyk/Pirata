import type { HandlerMap } from '../../core/context.js';
import { assertReference } from '../../core/shared.js';

export const capability: 'blocked' | 'ready' = 'ready';
export const handlers = {
  'expense.create': (ctx, c) => {
    assertReference(ctx, 'projects', c.projectId);
    const { type: _, ...fields } = c; void _;
    const id = ctx.newId();
    ctx.repo.insert('expenses', { ...fields, id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
    return { changed: true, result: { kind: 'expense', id } };
  },
  'expense.update': (ctx, c) => {
    const previous = ctx.repo.require('expenses', c.id);
    assertReference(ctx, 'projects', c.projectId);
    const { type: _, id, ...patch } = c; void _;
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(key => previous[key] !== patch[key]);
    if (changed) ctx.repo.update('expenses', id, { ...patch, updatedAt: ctx.serverNow });
    return { changed, result: { kind: 'expense', id } };
  },
} satisfies Pick<HandlerMap, 'expense.create' | 'expense.update'>;

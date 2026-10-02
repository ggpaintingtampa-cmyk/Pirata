// P09: the consequences of a bulk deletion, computed read-only with the same rules the command applies.
import type { FastifyInstance } from 'fastify';
import { bulkDeletePreviewRequestSchema, can } from '@pirata/contracts/index';
import type { Sqlite } from '../db/database.js';
import { checkMutation, requireSession } from '../auth/sessions.js';
import { ApiError } from '../core/errors.js';
import { Repositories } from '../core/repositories.js';
import { deletionPlan } from '../modules/trash/index.js';
export function registerTrashPreview(app: FastifyInstance, { db, origin, now }: { db: Sqlite; origin: string; now: () => number }): void {
  app.post('/api/v1/trash/preview', async req => {
    const s = requireSession(db, req, now()); checkMutation(req, s, origin);
    if (!can(s.role, 'records.bulkDelete')) throw new ApiError(403, 'FORBIDDEN', 'Only the owner can delete records in bulk.');
    const { items } = bulkDeletePreviewRequestSchema.parse(req.body ?? {});
    const repo = new Repositories(db, s.owner_id, () => true, s.user_id);
    return deletionPlan({ repo, role: s.role, userId: s.user_id, ownerId:s.owner_id }, items).preview;
  });
}

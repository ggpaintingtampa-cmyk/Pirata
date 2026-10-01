// Update 2026-09-29 (P10, section 20): the Camino work connection. Bearer tokens (sha256 at rest, shown once) name a
// subject account chosen by the owner; every route exports only that subject's assigned work, and completion runs the
// ordinary task.setStatus command as the subject, so permissions, timers, receipts and revisions behave as in the app.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { integrationTokenCreateSchema, mutationResultSchema, workCompleteSchema, workDispositionQuerySchema, workFeedQuerySchema, WORK_FEED_CONTRACT, type IntegrationScope, type IntegrationTokenSummary, type Role, type Task, type WorkCompleteResult, type WorkDispositions, type WorkFeedContext, type WorkFeedPage, type WorkFeedTask } from '@pirata/contracts/index';
import type { Sqlite } from '../db/database.js';
import { checkMutation, rateLimit, requireOwner } from '../auth/sessions.js';
import { executeCommand, revision as currentRevision } from '../core/commands.js';
import { ApiError } from '../core/errors.js';
import { Repositories } from '../core/repositories.js';
import { handlers } from '../modules/index.js';
import { requirementsOf } from '../modules/tasks-time/index.js';
import { businessDate } from '@pirata/domain/lib/dates';

interface TokenRow { id: string; owner_id: string; subject_user_id: string; scopes: string; revoked_at: number | null; last_used_at: number | null }
export interface FeedSubject { tokenId: string; ownerId: string; userId: string; role: Role; name: string; scopes: IntegrationScope[] }
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const cursorOf = (updatedAt: number, id: string) => Buffer.from(JSON.stringify([updatedAt, id])).toString('base64url');
function readCursor(cursor: string | undefined): [number, string] | null {
  if (!cursor) return null;
  try { const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown; if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'string') return [value[0], value[1]]; } catch { /* fall through */ }
  throw new ApiError(400, 'INVALID_INPUT', 'The cursor is not valid. Start from the first page.');
}

/** Resolves the bearer token to its subject. Unknown or revoked tokens are refused alike, with one code. */
export function authenticateToken(db: Sqlite, req: FastifyRequest, now: number): FeedSubject {
  const header = req.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const row = token ? db.prepare('SELECT id,owner_id,subject_user_id,scopes,revoked_at,last_used_at FROM integration_tokens WHERE token_hash=?').get(hash(token)) as TokenRow | undefined : undefined;
  if (!row || row.revoked_at !== null) throw new ApiError(401, 'TOKEN_REVOKED', 'This connection token is not valid. Create a new one in Pirata.');
  rateLimit(db, 'feed:' + row.id, now, 60);
  const member = new Repositories(db, row.owner_id).team().find(m => m.id === row.subject_user_id);
  if (!member || member.disabledAt !== null) throw new ApiError(401, 'TOKEN_REVOKED', 'The connected account is no longer active.');
  if (row.last_used_at === null || now - row.last_used_at >= 60000) db.prepare('UPDATE integration_tokens SET last_used_at=?,updated_at=? WHERE owner_id=? AND id=?').run(now, now, row.owner_id, row.id);
  return { tokenId: row.id, ownerId: row.owner_id, userId: member.id, role: member.role as Role, name: member.name, scopes: JSON.parse(row.scopes) as IntegrationScope[] };
}
const requireScope = (subject: FeedSubject, scope: IntegrationScope) => { if (!subject.scopes.includes(scope)) throw new ApiError(403, 'FORBIDDEN', `This token does not have the ${scope} scope.`); };

/** One rule: a live task is the subject's when its effective assignee is the subject (explicit or inherited), or when the subject's own day list references it. */
export function exportableTaskIds(repo: Repositories, subjectId: string): { tasks: Task[]; ids: Set<string> } {
  const all = repo.list('tasks').filter(task => !task.archivedAt);
  const planned = new Set(repo.list('day_assignments').filter(row => row.userId === subjectId && row.taskId).map(row => row.taskId as string));
  const tasks = all.filter(task => task.assigneeId === subjectId || planned.has(task.id)).sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id));
  return { tasks, ids: new Set(tasks.map(task => task.id)) };
}
function feedTask(repo: Repositories, subjectId: string, task: Task, all: Task[], today: string, timer: { sessionId: string; taskId: string; startedAt: number } | undefined): WorkFeedTask {
  const blocks = repo.list('schedule_blocks').filter(block => block.taskId === task.id).sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
  const upcoming = blocks.find(block => block.date >= today) ?? blocks.at(-1);
  return {
    id: task.id, projectId: task.projectId ?? null, parentTaskId: task.parentTaskId ?? null, title: task.title, description: task.description ?? '', status: task.status, position: task.position ?? 0,
    estimatedMinutes: task.estimatedMinutes, completedAt: task.completedAt ?? null, updatedAt: task.updatedAt, hasChildren: all.some(child => child.parentTaskId === task.id && !child.archivedAt),
    requirements: requirementsOf({ repo }, task.id).map(r => ({ kind: r.kind, name: r.name, quantity: r.quantity, unit: r.unit })),
    schedule: upcoming ? { date: upcoming.date, startMinute: upcoming.startMinute, endMinute: upcoming.endMinute } : null,
    plannedDates: [...new Set(repo.list('day_assignments').filter(row => row.userId === subjectId && row.taskId === task.id).map(row => row.date))].sort(),
    activeSession: timer && timer.taskId === task.id ? { sessionId: timer.sessionId, startedAt: timer.startedAt } : null,
  };
}
export function readFeedPage(db: Sqlite, subject: FeedSubject, query: { cursor?: string; limit: number }, now: number): WorkFeedPage {
  const repo = new Repositories(db, subject.ownerId);
  const all = repo.list('tasks');
  const { tasks } = exportableTaskIds(repo, subject.userId);
  const after = readCursor(query.cursor);
  const remaining = after ? tasks.filter(task => task.updatedAt > after[0] || (task.updatedAt === after[0] && task.id > after[1])) : tasks;
  const page = remaining.slice(0, query.limit), last = page.at(-1);
  const timer = repo.listTimers().find(t => t.userId === subject.userId);
  const today = businessDate(now);
  const context: WorkFeedContext[] = [];
  const exported = new Set(tasks.map(task => task.id)), seen = new Set<string>();
  for (const task of page) for (let parentId = task.parentTaskId ?? null; parentId; ) { const parent = all.find(t => t.id === parentId); if (!parent) break; if (!exported.has(parent.id) && !seen.has(parent.id)) { seen.add(parent.id); context.push({ id: parent.id, parentTaskId: parent.parentTaskId ?? null, projectId: parent.projectId ?? null, title: parent.title, context: true }); } parentId = parent.parentTaskId ?? null; }
  const projectIds = new Set([...page, ...context].map(t => t.projectId).filter((id): id is string => !!id));
  return {
    contract: WORK_FEED_CONTRACT, revision: currentRevision(db, subject.ownerId), serverNow: now, timezone: 'America/New_York',
    subject: { userId: subject.userId, name: subject.name, role: subject.role },
    page: { cursor: query.cursor ?? null, next: remaining.length > query.limit && last ? cursorOf(last.updatedAt, last.id) : null, limit: query.limit },
    projects: repo.list('projects').filter(p => projectIds.has(p.id)).map(p => ({ id: p.id, name: p.name, status: p.status, startDate: p.startDate ?? null, endDate: p.endDate ?? null, updatedAt: p.updatedAt })),
    tasks: page.map(task => feedTask(repo, subject.userId, task, all, today, timer)), context,
  };
}
export function readDispositions(db: Sqlite, subject: FeedSubject, ids: string[]): WorkDispositions {
  const repo = new Repositories(db, subject.ownerId), scope = exportableTaskIds(repo, subject.userId).ids;
  return { revision: currentRevision(db, subject.ownerId), items: ids.slice(0, 500).map(id => {
    const live = repo.get('tasks', id);
    if (live) {
      if (live.archivedAt) return { id, disposition: 'archived' as const };
      if (!scope.has(id)) return { id, disposition: 'unassigned' as const };
      return { id, disposition: live.status === 'done' ? 'done' as const : 'available' as const, status: live.status, completedAt: live.completedAt ?? null };
    }
    return { id, disposition: repo.getDeleted('tasks', id) ? 'deleted' as const : 'unknown' as const };
  }) };
}
/** Owner-side token management. */
export function listTokens(db: Sqlite, ownerId: string): IntegrationTokenSummary[] {
  const team = new Repositories(db, ownerId).team();
  return (db.prepare('SELECT id,label,subject_user_id,scopes,created_at,created_by,last_used_at,revoked_at FROM integration_tokens WHERE owner_id=? ORDER BY created_at DESC,id').all(ownerId) as Record<string, unknown>[]).map(row => ({
    id: String(row.id), label: String(row.label), subjectUserId: String(row.subject_user_id), subjectName: team.find(m => m.id === row.subject_user_id)?.name ?? '—', scopes: JSON.parse(String(row.scopes)) as IntegrationScope[],
    createdAt: Number(row.created_at), createdBy: String(row.created_by), lastUsedAt: (row.last_used_at as number | null) ?? null, revokedAt: (row.revoked_at as number | null) ?? null,
  }));
}
export function registerWorkFeed(app: FastifyInstance, { db, origin, now }: { db: Sqlite; origin: string; now: () => number }): void {
  app.get('/api/v1/integrations/work/v1/feed', async req => {
    const subject = authenticateToken(db, req, now()); requireScope(subject, 'work.read');
    const query = workFeedQuerySchema.parse(req.query ?? {});
    return readFeedPage(db, subject, query, now());
  });
  app.get('/api/v1/integrations/work/v1/dispositions', async req => {
    const subject = authenticateToken(db, req, now()); requireScope(subject, 'work.read');
    const { ids } = workDispositionQuerySchema.parse(req.query ?? {});
    return readDispositions(db, subject, ids.split(',').map(s => s.trim()).filter(Boolean));
  });
  /** Completion: leaf tasks only, as the subject, through the normal command path (receipt replay precedes the revision check). */
  app.post('/api/v1/integrations/work/v1/complete', async req => {
    const subject = authenticateToken(db, req, now()); requireScope(subject, 'work.complete');
    rateLimit(db, 'feed-write:' + subject.tokenId, now(), 60);
    const body = workCompleteSchema.parse(req.body ?? {});
    const repo = new Repositories(db, subject.ownerId);
    const task = repo.get('tasks', body.taskId);
    if (!task || task.archivedAt || !exportableTaskIds(repo, subject.userId).ids.has(task.id)) throw new ApiError(403, 'FORBIDDEN', 'This task is not assigned to the connected account.');
    if (repo.list('tasks').some(child => child.parentTaskId === task.id && !child.archivedAt)) throw new ApiError(409, 'TASK_HAS_CHILDREN', 'This task has steps. Complete it in Pirata, where every step is listed.');
    const result = executeCommand(db, subject.ownerId, { requestId: body.requestId, baseRevision: body.sourceRevision, command: { type: 'task.setStatus', id: task.id, status: 'done', expectedSessionId: body.expectedSessionId } }, handlers, now, subject.userId, subject.role);
    const after = new Repositories(db, subject.ownerId).get('tasks', task.id);
    const parsed = mutationResultSchema.parse(result);
    const answer: WorkCompleteResult = { requestId: parsed.requestId, revision: parsed.revision, serverNow: parsed.serverNow, changed: parsed.changed, task: { id: task.id, status: after?.status ?? 'done', completedAt: after?.completedAt ?? null } };
    return answer;
  });
  // Owner administration. The plaintext token is in the creation response only.
  app.get('/api/v1/admin/integrations', async req => { const s = requireOwner(db, req, now()); return listTokens(db, s.owner_id); });
  app.post('/api/v1/admin/integrations', async req => {
    const s = requireOwner(db, req, now()); checkMutation(req, s, origin);
    const input = integrationTokenCreateSchema.parse(req.body ?? {});
    const subject = new Repositories(db, s.owner_id).team().find(m => m.id === input.subjectUserId && m.disabledAt === null);
    if (!subject) throw new ApiError(400, 'INVALID_INPUT', 'Choose an active team member as the connected account.', { fields: { subjectUserId: 'Choose an active team member.' } });
    const token = randomBytes(32).toString('base64url'), id = randomUUID(), at = now();
    db.prepare('INSERT INTO integration_tokens (id,owner_id,created_at,updated_at,label,token_hash,subject_user_id,scopes,created_by,last_used_at,revoked_at) VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL)').run(id, s.owner_id, at, at, input.label, hash(token), input.subjectUserId, JSON.stringify(input.scopes), s.user_id);
    return { token, summary: listTokens(db, s.owner_id).find(item => item.id === id) };
  });
  app.post('/api/v1/admin/integrations/:id/revoke', async req => {
    const s = requireOwner(db, req, now()); checkMutation(req, s, origin);
    const { id } = z.object({ id: z.string().min(1).max(100) }).parse(req.params);
    const changed = db.prepare('UPDATE integration_tokens SET revoked_at=?,updated_at=? WHERE owner_id=? AND id=? AND revoked_at IS NULL').run(now(), now(), s.owner_id, id).changes;
    if (!changed && !listTokens(db, s.owner_id).some(item => item.id === id)) throw new ApiError(404, 'NOT_FOUND', 'Token not found.');
    return { summary: listTokens(db, s.owner_id).find(item => item.id === id) };
  });
}

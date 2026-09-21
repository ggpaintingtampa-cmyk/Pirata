import type { FastifyInstance } from 'fastify';
import { createReadStream, mkdirSync, readdirSync, statSync, openSync, closeSync, fsyncSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sqlite } from '../db/database.js';
import { checkMutation, requireSession, rateLimit } from '../auth/sessions.js';
import { ApiError, notFound } from '../core/errors.js';
import { Repositories } from '../core/repositories.js';
import { PDF_LIMIT, processFile } from './process.js';

export interface FileOptions { db: Sqlite; origin: string; now: () => number; storagePath?: string; storageLimitBytes?: number }
const keySchema = z.object({ id: z.string().uuid() });
const parentSchema = z.object({ parentType: z.enum(['task', 'project', 'client']), parentId: z.string().min(1).max(100), name: z.string().min(1).max(240) }).strict();
const parentTable = { task: 'tasks', project: 'projects', client: 'clients' } as const;
export function safeName(input: string, extension: string) { const name = Array.from(input, c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === '/' || c === '\\' ? '_' : c).join('').replace(/\.[^.]*$/, '').slice(0, 150).trim().replace(/^\.+/, '') || 'file'; return name + '.' + extension; }
function diskUsage(directory: string): number { return readdirSync(directory, { withFileTypes: true }).reduce((sum, item) => { if (!item.isFile()) return sum; return sum + statSync(join(directory, item.name)).size; }, 0); }
function writeImmutable(directory: string, key: string, bytes: Buffer) {
  const temporary = join(directory, '.' + randomUUID() + '.part'), destination = join(directory, key);
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  try { renameSync(temporary, destination); const directoryFd = openSync(directory, 'r'); try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); } } catch (error) { try { unlinkSync(temporary); } catch { /* retained for operator inspection */ } throw error; }
}
export function registerFiles(app: FastifyInstance, options: FileOptions) {
  const { db, origin, now } = options, directory = resolve(options.storagePath ?? join(dirname(db.name), 'uploads')), limit = options.storageLimitBytes ?? 2 * 1024 ** 3;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('File storage allowance must be a positive safe integer.');
  const webRoot = fileURLToPath(new URL('../../../web/', import.meta.url)).replace(/\/$/, '');
  if ([webRoot, '/srv/pirata/current', '/srv/pirata/shared', '/srv/pirata/releases'].some(root => directory === root || directory.startsWith(root + sep))) throw new Error('Uploads must remain outside all public web roots.');
  const revision = (ownerId: string) => db.prepare('UPDATE data_revisions SET revision=revision+1 WHERE owner_id=?').run(ownerId);
  const publicFile = (file: ReturnType<Repositories['list']>[number]) => { const { storageKey: _storage, previewKey: _preview, ...safe } = file as unknown as Record<string, unknown>; void _storage; void _preview; return safe; };
  app.register(async files => {
    // This hook precedes content parsing, including oversized/unauthenticated uploads.
    files.addHook('onRequest', async req => { const session = requireSession(db, req, now()); if (req.method !== 'GET') checkMutation(req, session, origin); });
    files.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: PDF_LIMIT }, (_req, body, done) => done(null, body));
    files.put('/api/v1/files/:id', { bodyLimit: PDF_LIMIT }, async (req, reply) => {
      const session = requireSession(db, req, now()), { id } = keySchema.parse(req.params), parent = parentSchema.parse(req.query), repo = new Repositories(db, session.owner_id);
      repo.require(parentTable[parent.parentType], parent.parentId);
      const previous = repo.get('attachments', id);
      if (previous) { if (previous.parentType !== parent.parentType || previous.parentId !== parent.parentId) throw new ApiError(409, 'FILE_CONFLICT', 'This upload identifier is already attached elsewhere.'); return publicFile(previous); }
      rateLimit(db, 'upload:' + (session.user_id ?? session.owner_id), now(), 60);
      if (!Buffer.isBuffer(req.body)) throw new ApiError(400, 'FILE_TYPE', 'Send one selected photo or PDF.');
      const processed = await processFile(req.body);
      // Recheck account/session after bounded asynchronous processing.
      requireSession(db, req, now());
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const bytes = processed.bytes.length + (processed.preview?.length ?? 0);
      if (diskUsage(directory) + bytes > limit) throw new ApiError(507, 'STORAGE_LIMIT', 'The shared file allowance is full. Ask the owner to increase storage; your upload has not been saved.');
      const storageKey = randomUUID() + '.' + processed.extension, previewKey = processed.preview ? randomUUID() + '.jpg' : null;
      const created: string[] = [];
      try {
        writeImmutable(directory, storageKey, processed.bytes); created.push(storageKey);
        if (previewKey && processed.preview) { writeImmutable(directory, previewKey, processed.preview); created.push(previewKey); }
        const timestamp = now();
        const item = { id, createdAt: timestamp, updatedAt: timestamp, ...parent, name: safeName(parent.name, processed.extension), mimeType: processed.mimeType, size: processed.bytes.length, storageKey, previewKey, removedAt: null, uploadedBy: session.user_id ?? session.owner_id };
        const saved = db.transaction(() => {
          const existing = repo.get('attachments', id); if (existing) return existing;
          repo.require(parentTable[parent.parentType], parent.parentId);
          repo.insert('attachments', item);
          const task = parent.parentType === 'task' ? repo.require('tasks', parent.parentId) : null;
          repo.insert('activity', { id: randomUUID(), createdAt: timestamp, updatedAt: timestamp, userId: item.uploadedBy, projectId: parent.parentType === 'project' ? parent.parentId : task?.projectId ?? null, taskId: task?.id ?? null, kind: 'file.add', body: `Added ${item.name}` });
          revision(session.owner_id); return item;
        }).immediate();
        if (saved.storageKey !== storageKey) for (const key of created) unlinkSync(join(directory, key));
        return reply.code(201).send(publicFile(saved));
      } catch (error) { for (const key of created) try { unlinkSync(join(directory, key)); } catch { /* Orphan retains private immutable data for recovery. */ } throw error; }
    });
    files.get('/api/v1/files/:id/content', async (req, reply) => {
      const session = requireSession(db, req, now()), { id } = keySchema.parse(req.params), file = new Repositories(db, session.owner_id).require('attachments', id);
      if (file.removedAt !== null) return notFound();
      const query = z.object({ preview: z.enum(['1']).optional() }).strict().parse(req.query), preview = query.preview === '1' && file.previewKey !== null;
      const key = preview ? file.previewKey! : file.storageKey;
      if (!/^[a-f0-9-]+\.(jpg|pdf)$/.test(key)) return notFound();
      const mimeType = preview ? 'image/jpeg' : file.mimeType;
      reply.header('Content-Type', mimeType).header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "sandbox; default-src 'none'; base-uri 'none'").header('Referrer-Policy', 'no-referrer').header('Cross-Origin-Resource-Policy', 'same-origin');
      const ascii = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_');
      reply.header('Content-Disposition', `${query.preview === '1' ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, '%27')}`);
      try { const path = join(directory, key); reply.header('Content-Length', statSync(path).size); return reply.send(createReadStream(path)); } catch { return notFound(); }
    });
    for (const restore of [false, true]) files.route({ method: restore ? 'POST' : 'DELETE', url: '/api/v1/files/:id' + (restore ? '/restore' : ''), handler: async req => {
      const session = requireSession(db, req, now()), { id } = keySchema.parse(req.params), repo = new Repositories(db, session.owner_id);
      return db.transaction(() => { const file = repo.require('attachments', id); const changed = restore ? file.removedAt !== null : file.removedAt === null; if (changed) { const timestamp = now(); repo.update('attachments', id, { removedAt: restore ? null : timestamp, updatedAt: timestamp }); const task = file.parentType === 'task' ? repo.require('tasks', file.parentId) : null; repo.insert('activity', { id: randomUUID(), createdAt: timestamp, updatedAt: timestamp, userId: session.user_id, projectId: file.parentType === 'project' ? file.parentId : task?.projectId ?? null, taskId: task?.id ?? null, kind: restore ? 'file.restore' : 'file.remove', body: `${restore ? 'Restored' : 'Removed (recoverable)'} ${file.name}` }); revision(session.owner_id); } return { id, removed: !restore }; }).immediate();
    } });
  });
}

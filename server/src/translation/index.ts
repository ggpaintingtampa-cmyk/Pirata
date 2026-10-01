// P13 routes: lookup, translate, correct, state a source language, owner settings and backfill.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { translationBackfillSchema, translationCorrectSchema, translationLookupSchema, translationSettingsSchema, translationSourceSchema, type BusinessSnapshot, type Locale, type TranslatableKind, type TranslationItem } from '@pirata/contracts/index';
import { isOfficeRole } from '@pirata/contracts/permissions';
import type { Sqlite } from '../db/database.js';
import { checkMutation, requireOwner, requireSession } from '../auth/sessions.js';
import { ApiError } from '../core/errors.js';
import { readSnapshot } from '../core/snapshot.js';
import { capabilities } from '../modules/index.js';
import { apiKey } from '../ai/index.js';
import { correctTranslation, hashText, saveCursor, saveSettings, setSourceLocale, settings as readSettings } from './cache.js';
import { listRecords, readField, readFields } from './fields.js';
import { createTranslationService, type TranslationService } from './service.js';

/** Who may correct a translation or state a field's language: the office, or the author of that record. */
export function mayCorrect(snapshot: BusinessSnapshot, role: string | undefined, userId: string, kind: TranslatableKind, id: string): boolean {
  if (isOfficeRole(role)) return true;
  const mine = (value: string | null | undefined) => value === userId;
  switch (kind) {
    case 'task': return mine(snapshot.tasks.find(t => t.id === id)?.assigneeId);
    case 'question': return mine((snapshot.taskQuestions ?? []).find(q => q.id === id)?.askedBy);
    case 'projectNote': return mine((snapshot.projectNotes ?? []).find(n => n.id === id)?.createdBy);
    case 'materialRequest': return mine((snapshot.shoppingItems ?? []).find(i => i.id === id)?.createdBy);
    case 'dayNote': return mine((snapshot.dayNotes ?? []).find(n => n.id === id)?.userId);
    case 'message': return mine((snapshot.activity ?? []).find(a => a.id === id)?.userId);
    case 'attachmentComment': return mine((snapshot.attachmentComments ?? []).find(c => c.id === id)?.userId);
    case 'equipmentReport': return mine((snapshot.equipmentReports ?? []).find(r => r.id === id)?.reportedBy);
    case 'shift': return mine((snapshot.workShifts ?? []).find(s => s.id === id)?.userId);
    case 'timeEntry': return mine(snapshot.timeEntries.find(e => e.id === id)?.userId);
    case 'toolSignOut': return mine((snapshot.toolSignOuts ?? []).find(o => o.id === id)?.takenBy);
    default: return false;
  }
}

export interface TranslationOptions { db: Sqlite; origin: string; now(): number; fetcher?: typeof fetch; service?: TranslationService }
export function registerTranslation(app: FastifyInstance, { db, origin, now, fetcher, service: given }: TranslationOptions): TranslationService {
  const service = given ?? createTranslationService({ db, now, apiKey, fetcher });
  const snapshotFor = (s: { owner_id: string; user_id: string; role: string }) => readSnapshot(db, s.owner_id, capabilities, now(), s.user_id, s.role as never);
  app.post('/api/v1/translations/lookup', async req => {
    const s = requireSession(db, req, now()), body = translationLookupSchema.parse(req.body), snapshot = snapshotFor(s);
    return { revision: snapshot.revision, epoch: snapshot.translationEpoch ?? 0, items: service.lookup(s.owner_id, snapshot, body.target, body.items) };
  });
  app.post('/api/v1/translations/translate', async req => {
    const s = requireSession(db, req, now()); checkMutation(req, s, origin);
    const body = translationLookupSchema.extend({ items: z.array(translationLookupSchema.shape.items.element).min(1).max(40) }).parse(req.body), snapshot = snapshotFor(s);
    const items = await service.translate(s.owner_id, s.user_id, snapshot, body.target, body.items);
    requireSession(db, req, now()); // The account may have been disabled while the provider was running.
    return { revision: snapshot.revision, epoch: readSettings(db, s.owner_id).cacheEpoch, items };
  });
  app.post('/api/v1/translations/correct', async req => {
    const s = requireSession(db, req, now()); checkMutation(req, s, origin);
    const body = translationCorrectSchema.parse(req.body), snapshot = snapshotFor(s);
    const original = readField(snapshot, body.kind, body.id, body.field);
    if (original === undefined) throw new ApiError(404, 'NOT_FOUND', 'Record not found.');
    if (!mayCorrect(snapshot, s.role, s.user_id, body.kind, body.id)) throw new ApiError(403, 'FORBIDDEN', 'Only the office or the author can correct this translation.');
    const sourceLocale: Locale = body.target === 'en' ? 'es' : 'en';
    correctTranslation(db, s.owner_id, body, body.target, hashText(original), sourceLocale, body.text, s.user_id, readSettings(db, s.owner_id).glossaryVersion, now());
    return { ok: true, epoch: readSettings(db, s.owner_id).cacheEpoch };
  });
  app.post('/api/v1/translations/source', async req => {
    const s = requireSession(db, req, now()); checkMutation(req, s, origin);
    const body = translationSourceSchema.parse(req.body), snapshot = snapshotFor(s);
    const original = readField(snapshot, body.kind, body.id, body.field);
    if (original === undefined) throw new ApiError(404, 'NOT_FOUND', 'Record not found.');
    if (!mayCorrect(snapshot, s.role, s.user_id, body.kind, body.id)) throw new ApiError(403, 'FORBIDDEN', 'Only the office or the author can state the language of this text.');
    setSourceLocale(db, s.owner_id, body, hashText(original), body.locale, s.user_id, now());
    return { ok: true, epoch: readSettings(db, s.owner_id).cacheEpoch };
  });
  app.get('/api/v1/admin/translation', async req => {
    const s = requireOwner(db, req, now()), v = readSettings(db, s.owner_id);
    let keyConfigured = false; try { keyConfigured = !!apiKey(); } catch { /* Never expose secret-file details. */ }
    const usage = db.prepare("SELECT user_id,created_at,status,input_tokens,output_tokens,cost_cents,reserved_cents FROM ai_usage WHERE owner_id=? AND kind='translation' ORDER BY created_at DESC LIMIT 100").all(s.owner_id);
    const cached = (db.prepare('SELECT count(*) n FROM translations WHERE owner_id=?').get(s.owner_id) as { n: number }).n;
    const { backfillCursor, cacheEpoch, glossaryVersion, ...settings } = v;
    return { settings, keyConfigured, usage, cached, backfillCursor, cacheEpoch, glossaryVersion };
  });
  app.post('/api/v1/admin/translation', async req => {
    const s = requireOwner(db, req, now()); checkMutation(req, s, origin);
    const v = translationSettingsSchema.parse(req.body);
    if (v.enabled && v.provider === 'openai' && (!v.model || !v.dailyRequests || !v.monthlyBudgetCents || !v.inputCentsPerMillion || !v.outputCentsPerMillion)) throw new ApiError(400, 'ALLOWANCE_REQUIRED', 'Set a model, request limit, budget and current provider token rates before enabling.');
    saveSettings(db, s.owner_id, v);
    return { ok: true };
  });
  /** Bounded, resumable cache fill for records written before translation existed. */
  app.post('/api/v1/admin/translation/backfill', async req => {
    const s = requireOwner(db, req, now()); checkMutation(req, s, origin);
    const body = translationBackfillSchema.parse(req.body), snapshot = snapshotFor(s);
    service.assertProviderConfigured(s.owner_id);
    const records = listRecords(snapshot), cursor = readSettings(db, s.owner_id).backfillCursor;
    const start = cursor ? records.findIndex(r => `${r.kind}:${r.id}` === cursor) + 1 : 0;
    const items: TranslationItem[] = [];
    let index = start;
    for (; index < records.length && items.length < body.limit; index++) {
      const r = records[index], fields = readFields(snapshot, r.kind, r.id) ?? {};
      for (const [field, value] of Object.entries(fields)) if (value.trim()) items.push({ kind: r.kind, id: r.id, field });
    }
    let translated = 0, unavailable = 0;
    for (let i = 0; i < items.length; i += 40) {
      const results = await service.translate(s.owner_id, s.user_id, snapshot, body.target, items.slice(i, i + 40));
      translated += results.filter(r => r.status === 'ready' || r.status === 'corrected' || r.status === 'same' || r.status === 'unsure').length;
      unavailable += results.filter(r => r.status === 'unavailable').length;
      if (results.some(r => r.reason === 'budget' || r.reason === 'disabled')) break;
    }
    const last = index > 0 ? records[index - 1] : undefined;
    const done = index >= records.length;
    saveCursor(db, s.owner_id, done || !last ? null : `${last.kind}:${last.id}`);
    return { processedRecords: index - start, totalRecords: records.length, translated, unavailable, done };
  });
  return service;
}

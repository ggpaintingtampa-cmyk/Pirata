// P13: the derived translation cache on Pirata's server. Rows are keyed by record, field and target; the source hash
// decides freshness, the owner's cache epoch tells clients when to re-key, and corrected rows are never overwritten.
import { createHash } from 'node:crypto';
import type { Sqlite } from '../db/database.js';
import type { Locale, SourceLocale, TranslationSettings } from '@pirata/contracts/translation';

export const hashText = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
export interface StoredSettings extends TranslationSettings { glossaryVersion: number; cacheEpoch: number; backfillCursor: string | null }
const DEFAULTS: StoredSettings = { enabled: false, provider: 'openai', model: '', dailyRequests: 0, monthlyBudgetCents: 0, inputCentsPerMillion: 0, outputCentsPerMillion: 0, glossaryVersion: 0, cacheEpoch: 0, backfillCursor: null };
export function settings(db: Sqlite, owner: string): StoredSettings {
  const r = db.prepare('SELECT * FROM translation_settings WHERE owner_id=?').get(owner) as Record<string, unknown> | undefined;
  if (!r) return { ...DEFAULTS };
  return { enabled: r.enabled === 1, provider: r.provider as StoredSettings['provider'], model: r.model as string, dailyRequests: r.daily_requests as number, monthlyBudgetCents: r.monthly_budget_cents as number, inputCentsPerMillion: r.input_cents_per_million as number, outputCentsPerMillion: r.output_cents_per_million as number, glossaryVersion: r.glossary_version as number, cacheEpoch: r.cache_epoch as number, backfillCursor: (r.backfill_cursor as string | null) ?? null };
}
export function saveSettings(db: Sqlite, owner: string, v: TranslationSettings): void {
  db.prepare('INSERT INTO translation_settings (owner_id,enabled,provider,model,daily_requests,monthly_budget_cents,input_cents_per_million,output_cents_per_million) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled,provider=excluded.provider,model=excluded.model,daily_requests=excluded.daily_requests,monthly_budget_cents=excluded.monthly_budget_cents,input_cents_per_million=excluded.input_cents_per_million,output_cents_per_million=excluded.output_cents_per_million')
    .run(owner, Number(v.enabled), v.provider, v.model, v.dailyRequests, v.monthlyBudgetCents, v.inputCentsPerMillion, v.outputCentsPerMillion);
}
export function saveCursor(db: Sqlite, owner: string, cursor: string | null): void {
  db.prepare('INSERT INTO translation_settings (owner_id,backfill_cursor) VALUES (?,?) ON CONFLICT(owner_id) DO UPDATE SET backfill_cursor=excluded.backfill_cursor').run(owner, cursor);
}
export function bumpEpoch(db: Sqlite, owner: string): void {
  db.prepare('INSERT INTO translation_settings (owner_id,cache_epoch) VALUES (?,1) ON CONFLICT(owner_id) DO UPDATE SET cache_epoch=cache_epoch+1').run(owner);
}
export function glossary(db: Sqlite, owner: string): { en: string; es: string }[] {
  return db.prepare('SELECT en,es FROM translation_glossary WHERE owner_id=? AND deleted_at IS NULL ORDER BY en').all(owner) as { en: string; es: string }[];
}

export interface CacheRow { text: string; status: 'ready' | 'corrected' | 'failed'; sourceLocale: SourceLocale; confidence: number; sourceHash: string; glossaryVersion: number; provider: string; updatedAt: number }
type Key = { kind: string; id: string; field: string };
export function getCached(db: Sqlite, owner: string, key: Key, target: Locale): CacheRow | undefined {
  const r = db.prepare('SELECT text,status,source_locale,confidence,source_hash,glossary_version,provider,updated_at FROM translations WHERE owner_id=? AND record_kind=? AND record_id=? AND field=? AND target_locale=?').get(owner, key.kind, key.id, key.field, target) as Record<string, unknown> | undefined;
  return r ? { text: r.text as string, status: r.status as CacheRow['status'], sourceLocale: r.source_locale as SourceLocale, confidence: r.confidence as number, sourceHash: r.source_hash as string, glossaryVersion: r.glossary_version as number, provider: r.provider as string, updatedAt: r.updated_at as number } : undefined;
}
/** Every cached row for one target language, for search and exports. */
export function allCached(db: Sqlite, owner: string, target: Locale): Map<string, CacheRow & Key> {
  const rows = db.prepare('SELECT record_kind,record_id,field,text,status,source_locale,confidence,source_hash,glossary_version,provider,updated_at FROM translations WHERE owner_id=? AND target_locale=? AND status!=?').all(owner, target, 'failed') as Record<string, unknown>[];
  return new Map(rows.map(r => [`${r.record_kind}|${r.record_id}|${r.field}`, { kind: r.record_kind as string, id: r.record_id as string, field: r.field as string, text: r.text as string, status: r.status as CacheRow['status'], sourceLocale: r.source_locale as SourceLocale, confidence: r.confidence as number, sourceHash: r.source_hash as string, glossaryVersion: r.glossary_version as number, provider: r.provider as string, updatedAt: r.updated_at as number }]));
}
export interface PutInput { key: Key; target: Locale; sourceHash: string; sourceLocale: SourceLocale; text: string; status: 'ready' | 'failed'; provider: string; glossaryVersion: number; confidence: number; startedAt: number }
/**
 * Stores a provider result. A manual correction for the same source is kept; a row that was updated after this request
 * started (a newer source version translated meanwhile) is kept too, so a late answer never overwrites a fresher one.
 */
export function putTranslation(db: Sqlite, owner: string, input: PutInput, now: number): boolean {
  return db.transaction(() => {
    const existing = getCached(db, owner, input.key, input.target);
    if (existing && existing.status === 'corrected' && existing.sourceHash === input.sourceHash) return false;
    if (existing && existing.sourceHash !== input.sourceHash && existing.updatedAt > input.startedAt) return false;
    db.prepare('INSERT INTO translations (owner_id,record_kind,record_id,field,target_locale,source_hash,source_locale,text,status,provider,glossary_version,confidence,corrected_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?) ON CONFLICT(owner_id,record_kind,record_id,field,target_locale) DO UPDATE SET source_hash=excluded.source_hash,source_locale=excluded.source_locale,text=excluded.text,status=excluded.status,provider=excluded.provider,glossary_version=excluded.glossary_version,confidence=excluded.confidence,corrected_by=NULL,updated_at=excluded.updated_at')
      .run(owner, input.key.kind, input.key.id, input.key.field, input.target, input.sourceHash, input.sourceLocale, input.text, input.status, input.provider, input.glossaryVersion, input.confidence, now, now);
    return true;
  }).immediate();
}
export function correctTranslation(db: Sqlite, owner: string, key: Key, target: Locale, sourceHash: string, sourceLocale: SourceLocale, text: string, userId: string, glossaryVersion: number, now: number): void {
  db.transaction(() => {
    db.prepare('INSERT INTO translations (owner_id,record_kind,record_id,field,target_locale,source_hash,source_locale,text,status,provider,glossary_version,confidence,corrected_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,100,?,?,?) ON CONFLICT(owner_id,record_kind,record_id,field,target_locale) DO UPDATE SET source_hash=excluded.source_hash,source_locale=excluded.source_locale,text=excluded.text,status=excluded.status,provider=excluded.provider,glossary_version=excluded.glossary_version,confidence=100,corrected_by=excluded.corrected_by,updated_at=excluded.updated_at')
      .run(owner, key.kind, key.id, key.field, target, sourceHash, sourceLocale, text, 'corrected', 'manual', glossaryVersion, userId, now, now);
    bumpEpoch(db, owner);
  }).immediate();
}
export function sourceOverride(db: Sqlite, owner: string, key: Key): { locale: Locale; sourceHash: string } | undefined {
  const r = db.prepare('SELECT locale,source_hash FROM translation_source_locales WHERE owner_id=? AND record_kind=? AND record_id=? AND field=?').get(owner, key.kind, key.id, key.field) as { locale: Locale; source_hash: string } | undefined;
  return r ? { locale: r.locale, sourceHash: r.source_hash } : undefined;
}
/** States the source language of one field: the field's cached translations are dropped so they are re-made from the stated language. */
export function setSourceLocale(db: Sqlite, owner: string, key: Key, sourceHash: string, locale: Locale, userId: string, now: number): void {
  db.transaction(() => {
    db.prepare('INSERT INTO translation_source_locales (owner_id,record_kind,record_id,field,source_hash,locale,set_by,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,record_kind,record_id,field) DO UPDATE SET source_hash=excluded.source_hash,locale=excluded.locale,set_by=excluded.set_by,created_at=excluded.created_at')
      .run(owner, key.kind, key.id, key.field, sourceHash, locale, userId, now);
    db.prepare('DELETE FROM translations WHERE owner_id=? AND record_kind=? AND record_id=? AND field=? AND status!=?').run(owner, key.kind, key.id, key.field, 'corrected');
    bumpEpoch(db, owner);
  }).immediate();
}

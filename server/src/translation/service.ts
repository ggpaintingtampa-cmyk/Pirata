// P13: lookup (cache only) and translate (bounded provider calls) over the role-filtered snapshot. Budgets, dedupe,
// batching and late-result protection live here; the routes only authenticate and parse.
import { randomUUID } from 'node:crypto';
import type { BusinessSnapshot, Locale, TranslationItem, TranslationResult } from '@pirata/contracts/index';
import type { Sqlite } from '../db/database.js';
import { ApiError } from '../core/errors.js';
import { detectLocale } from './detect.js';
import { readField } from './fields.js';
import { getCached, glossary, hashText, putTranslation, settings, sourceOverride, type StoredSettings } from './cache.js';
import { ProviderFailure, openAiProvider, type TranslationProvider } from './provider.js';

export interface ServiceOptions { db: Sqlite; now(): number; apiKey(): string; fetcher?: typeof fetch }
export const BATCH_ITEMS = 40, BATCH_CHARS = 6000, REQUEST_TIMEOUT_MS = 20000;
const key = (owner: string, item: TranslationItem, target: Locale, hash: string) => [owner, item.kind, item.id, item.field, target, hash].join('|');
type Unavailable = NonNullable<TranslationResult['reason']>;

export function createTranslationService({ db, now, apiKey, fetcher }: ServiceOptions) {
  const inFlight = new Map<string, Promise<void>>();

  function providerFor(v: StoredSettings): TranslationProvider | Unavailable {
    if (!v.enabled || v.provider === 'none') return 'disabled';
    let secret: string;
    try { secret = apiKey(); } catch { return 'disabled'; }
    if (!secret || !v.model) return 'disabled';
    return openAiProvider(v.model, secret, fetcher);
  }
  /** Allowance check mirrors Ask: provider calls per UTC day and reserved/actual cents per UTC month, counted on `kind='translation'` rows. */
  function reserve(owner: string, userId: string, v: StoredSettings, inputChars: number): { id: string; cents: number } | Unavailable {
    const at = now(), month = new Date(at).toISOString().slice(0, 7), day = new Date(at).toISOString().slice(0, 10);
    const cents = Math.max(1, Math.ceil((inputChars / 4 + 400) * v.inputCentsPerMillion / 1e6 + (inputChars / 3 + 200) * v.outputCentsPerMillion / 1e6));
    return db.transaction(() => {
      const requests = (db.prepare("SELECT count(*) n FROM ai_usage WHERE owner_id=? AND kind='translation' AND created_at>=?").get(owner, Date.parse(day + 'T00:00:00Z')) as { n: number }).n;
      const spent = (db.prepare("SELECT coalesce(sum(max(cost_cents,reserved_cents)),0) n FROM ai_usage WHERE owner_id=? AND kind='translation' AND created_at>=?").get(owner, Date.parse(month + '-01T00:00:00Z')) as { n: number }).n;
      if (requests >= v.dailyRequests || spent + cents > v.monthlyBudgetCents) return 'budget' as const;
      const id = randomUUID();
      db.prepare("INSERT INTO ai_usage (id,owner_id,user_id,created_at,status,reserved_cents,kind) VALUES (?,?,?,?,'pending',?,'translation')").run(id, owner, userId, at, cents);
      return { id, cents };
    }).immediate();
  }
  function settle(id: string, v: StoredSettings, usage: { inputTokens: number; outputTokens: number } | null, reserved: number) {
    if (!usage) { db.prepare("UPDATE ai_usage SET status='failed' WHERE id=?").run(id); return; }
    const cost = Math.ceil((usage.inputTokens * v.inputCentsPerMillion + usage.outputTokens * v.outputCentsPerMillion) / 1e6);
    db.prepare("UPDATE ai_usage SET status='complete',input_tokens=?,output_tokens=?,cost_cents=?,reserved_cents=? WHERE id=?").run(usage.inputTokens, usage.outputTokens, cost, usage.inputTokens ? 0 : reserved, id);
  }

  /** Cache-only answer for one item. `pending` means a provider call is needed. */
  function lookupOne(owner: string, snapshot: BusinessSnapshot, v: StoredSettings, target: Locale, item: TranslationItem): TranslationResult & { text?: string; original?: string } {
    const base = { kind: item.kind, id: item.id, field: item.field };
    const original = readField(snapshot, item.kind, item.id, item.field);
    if (original === undefined) return { ...base, status: 'unavailable', reason: 'missing', sourceLocale: 'unknown', confidence: 0 };
    if (!original.trim()) return { ...base, status: 'same', sourceLocale: 'unknown', confidence: 100, text: original };
    const sourceHash = hashText(original), override = sourceOverride(db, owner, base);
    const stated = override && override.sourceHash === sourceHash ? override.locale : undefined;
    const detected = stated ? { locale: stated, confidence: 100 } : detectLocale(original);
    if (detected.locale === target && detected.confidence >= 50) return { ...base, status: 'same', sourceLocale: detected.locale, confidence: detected.confidence, sourceHash, text: original };
    const cached = getCached(db, owner, base, target);
    if (cached && cached.sourceHash === sourceHash && cached.status !== 'failed') {
      if (cached.status === 'corrected') return { ...base, status: 'corrected', sourceLocale: stated ?? cached.sourceLocale, confidence: 100, sourceHash, text: cached.text };
      if ((stated ?? cached.sourceLocale) === target) return { ...base, status: 'same', sourceLocale: stated ?? cached.sourceLocale, confidence: cached.confidence, sourceHash, text: original };
      const status = cached.confidence < 50 && !stated ? 'unsure' : 'ready';
      return { ...base, status, sourceLocale: stated ?? cached.sourceLocale, confidence: cached.confidence, sourceHash, text: cached.text, ...(cached.glossaryVersion < v.glossaryVersion ? { stale: true as const } : {}) };
    }
    return { ...base, status: 'pending', sourceLocale: detected.locale, confidence: detected.confidence, sourceHash, original };
  }

  return {
    lookup(owner: string, snapshot: BusinessSnapshot, target: Locale, items: TranslationItem[]): TranslationResult[] {
      const v = settings(db, owner);
      return items.map(item => { const { original: _, ...result } = lookupOne(owner, snapshot, v, target, item); void _; return result; });
    },
    /** Translates what is pending (and what is stale), bounded by batch size and the owner's allowance. Visible-first order is the caller's order. */
    async translate(owner: string, userId: string, snapshot: BusinessSnapshot, target: Locale, items: TranslationItem[]): Promise<TranslationResult[]> {
      const v = settings(db, owner);
      const first = items.map(item => lookupOne(owner, snapshot, v, target, item));
      const todo = first.filter(r => r.status === 'pending' || r.stale).map(r => ({...r, original: readField(snapshot, r.kind, r.id, r.field)}));
      if (!todo.length) return first.map(({ original: _, ...r }) => { void _; return r; });
      const provider = providerFor(v);
      const unavailable = (reason: Unavailable): TranslationResult[] => first.map(({ original: _, ...r }) => { void _; return r.status === 'pending' ? { ...r, status: 'unavailable', reason } : r; });
      if (typeof provider === 'string') return unavailable(provider);
      const startedAt = now(), terms = glossary(db, owner);
      // Deduplicate against identical requests already running (another viewer, a second tab).
      const waits: Promise<void>[] = [], mine: typeof todo = [];
      for (const r of todo) { const k = key(owner, r, target, r.sourceHash!); const running = inFlight.get(k); if (running) waits.push(running); else mine.push(r); }
      let failure: Unavailable | null = null;
      if (mine.length) {
        const batches: typeof mine[] = [];
        for (const r of mine) { const last = batches.at(-1); if (last && last.length < BATCH_ITEMS && last.reduce((s, x) => s + (x.original ?? '').length, 0) + (r.original ?? '').length <= BATCH_CHARS) last.push(r); else batches.push([r]); }
        for (const batch of batches) {
          const chars = batch.reduce((s, x) => s + (x.original ?? '').length, 0);
          const reservation = reserve(owner, userId, v, chars);
          if (typeof reservation === 'string') { failure = reservation; break; }
          const done = (async () => {
            try {
              const result = await provider.translate({ target, glossary: terms, items: batch.map(r => ({ id: `${r.kind}|${r.id}|${r.field}`, text: r.original ?? '', sourceHint: r.sourceLocale === 'en' || r.sourceLocale === 'es' ? r.sourceLocale : 'auto' })) }, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
              for (const r of batch) {
                const answer = result.items.find(x => x.id === `${r.kind}|${r.id}|${r.field}`);
                if (!answer) continue;
                putTranslation(db, owner, { key: r, target, sourceHash: r.sourceHash!, sourceLocale: answer.detected, text: answer.detected === target ? r.original ?? '' : answer.text, status: 'ready', provider: provider.name, glossaryVersion: v.glossaryVersion, confidence: answer.confidence, startedAt }, now());
              }
              settle(reservation.id, v, result.usage, reservation.cents);
            } catch (error) {
              settle(reservation.id, v, null, reservation.cents);
              failure = error instanceof ProviderFailure ? 'provider' : 'provider';
            }
          })();
          const keys = batch.map(r => key(owner, r, target, r.sourceHash!));
          for (const k of keys) inFlight.set(k, done);
          try { await done; } finally { for (const k of keys) inFlight.delete(k); }
        }
      }
      await Promise.allSettled(waits);
      const second = items.map(item => lookupOne(owner, snapshot, v, target, item));
      return second.map(({ original: _, ...r }) => { void _; return r.status === 'pending' ? { ...r, status: 'unavailable', reason: failure ?? 'provider' } : r; });
    },
    settings: (owner: string) => settings(db, owner),
    assertProviderConfigured(owner: string): void { if (typeof providerFor(settings(db, owner)) === 'string') throw new ApiError(409, 'TRANSLATION_UNAVAILABLE', 'Translation is waiting for the owner to connect a key and configure an allowance.'); },
  };
}
export type TranslationService = ReturnType<typeof createTranslationService>;

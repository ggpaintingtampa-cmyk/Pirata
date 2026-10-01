// P13: the client side of content translation. An in-memory map (never browser storage) keyed by record, field, target
// language, the text's own hash and the owner's cache epoch. Mounted texts are looked up in batches (cache only), and
// only what is still pending and still on screen is sent for translation, visible-first, a bounded batch at a time.
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { TranslatableKind, TranslationResponse, TranslationResult } from '@pirata/contracts/index';
import { ServerContext, useServer } from '../state/serverContext';
import type { PirataService } from '../services/api';
import { useLocale, type Locale } from './index';

export interface Entry { status: TranslationResult['status']; text?: string; sourceLocale: TranslationResult['sourceLocale']; confidence: number; reason?: TranslationResult['reason']; stale?: boolean }
export interface Item { kind: TranslatableKind; id: string; field: string; target: Locale }
/** FNV-1a over the text plus its length: cheap, synchronous, and enough to tell an edit apart. */
export function textHash(text: string): string { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return (h >>> 0).toString(16) + ':' + text.length; }
export const entryKey = (item: Item, text: string, epoch: number) => [item.kind, item.id, item.field, item.target, textHash(text), epoch].join('|');
const LOOKUP_BATCH = 200, TRANSLATE_BATCH = 40, DEBOUNCE_MS = 150, PAUSE_MS = 5 * 60 * 1000;

export class TranslationStore {
  readonly entries = new Map<string, Entry>();
  readonly #mounted = new Map<string, { item: Item; count: number }>();
  readonly #lookupQueue = new Set<string>();
  readonly #listeners = new Set<() => void>();
  #timer: number | undefined; #translating = false; #pausedUntil = 0; #version = 0;
  readonly service: Pick<PirataService, 'call'>; readonly now: () => number;
  constructor(service: Pick<PirataService, 'call'>, now: () => number = Date.now) { this.service = service; this.now = now; }
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  version = () => this.#version;
  #publish() { this.#version++; for (const listener of this.#listeners) listener(); }
  register(key: string, item: Item): void {
    const slot = this.#mounted.get(key);
    if (slot) { slot.count++; return; }
    this.#mounted.set(key, { item, count: 1 });
    if (!this.entries.has(key)) { this.#lookupQueue.add(key); this.#schedule(); }
  }
  unregister(key: string): void { const slot = this.#mounted.get(key); if (!slot) return; if (--slot.count <= 0) this.#mounted.delete(key); }
  /** Forget an entry so it is looked up (and translated) again, e.g. after Retry or a correction. */
  retry(key: string): void { this.entries.delete(key); this.#pausedUntil = 0; if (this.#mounted.has(key)) { this.#lookupQueue.add(key); this.#schedule(); } }
  clear(): void { this.entries.clear(); this.#lookupQueue.clear(); this.#pausedUntil = 0; this.#publish(); }
  #schedule() { if (this.#timer !== undefined) return; this.#timer = window.setTimeout(() => { this.#timer = undefined; void this.#flush(); }, DEBOUNCE_MS); }
  #byTarget(keys: string[]): Map<Locale, string[]> { const groups = new Map<Locale, string[]>(); for (const key of keys) { const slot = this.#mounted.get(key); if (!slot) continue; const list = groups.get(slot.item.target) ?? []; list.push(key); groups.set(slot.item.target, list); } return groups; }
  async #flush(): Promise<void> {
    const keys = [...this.#lookupQueue].filter(key => this.#mounted.has(key)).slice(0, LOOKUP_BATCH);
    for (const key of keys) this.#lookupQueue.delete(key);
    if (!keys.length) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { for (const key of keys) this.entries.set(key, { status: 'unavailable', reason: 'offline', sourceLocale: 'unknown', confidence: 0 }); this.#publish(); return; }
    for (const [target, group] of this.#byTarget(keys)) {
      const items = group.map(key => { const { kind, id, field } = this.#mounted.get(key)!.item; return { kind, id, field }; });
      try {
        const response = await this.service.call<TranslationResponse>('translations/lookup', { target, items });
        response.items.forEach((result, index) => this.entries.set(group[index], this.#entry(result)));
      } catch { for (const key of group) this.entries.set(key, { status: 'unavailable', reason: 'offline', sourceLocale: 'unknown', confidence: 0 }); }
    }
    this.#publish();
    if (this.#lookupQueue.size) this.#schedule();
    void this.#translatePending();
  }
  #entry(result: TranslationResult): Entry { return { status: result.status, text: result.text, sourceLocale: result.sourceLocale, confidence: result.confidence, reason: result.reason, stale: result.stale }; }
  async #translatePending(): Promise<void> {
    if (this.#translating || this.now() < this.#pausedUntil) return;
    this.#translating = true;
    try {
      for (;;) {
        const pending = [...this.#mounted.keys()].filter(key => { const entry = this.entries.get(key); return entry && (entry.status === 'pending' || entry.stale); }).slice(0, TRANSLATE_BATCH);
        if (!pending.length) return;
        let progressed = false;
        for (const [target, group] of this.#byTarget(pending)) {
          const items = group.map(key => { const { kind, id, field } = this.#mounted.get(key)!.item; return { kind, id, field }; });
          try {
            const response = await this.service.call<TranslationResponse>('translations/translate', { target, items });
            response.items.forEach((result, index) => this.entries.set(group[index], this.#entry(result)));
            if (response.items.some(result => result.reason === 'disabled' || result.reason === 'budget')) this.#pausedUntil = this.now() + PAUSE_MS;
            progressed = true;
          } catch { for (const key of group) this.entries.set(key, { status: 'unavailable', reason: 'offline', sourceLocale: 'unknown', confidence: 0 }); }
        }
        this.#publish();
        if (!progressed || this.now() < this.#pausedUntil) return;
      }
    } finally { this.#translating = false; }
  }
}

const TranslationContext = createContext<TranslationStore | null>(null);
export function TranslationProvider({ children, store: given }: { children: ReactNode; store?: TranslationStore }) {
  const { store: server, state } = useServer();
  const store = useMemo(() => given ?? new TranslationStore(server.service), [given, server]);
  useEffect(() => { if (state.status === 'signed-out') store.clear(); }, [state.status, store]);
  return <TranslationContext.Provider value={store}>{children}</TranslationContext.Provider>;
}
export interface Translated { text: string; original: string; translation?: string; status: Entry['status'] | 'same'; isTranslated: boolean; sourceLocale: Entry['sourceLocale']; reason?: Entry['reason']; stale: boolean; retry(): void; key: string | null }
/** The viewer-language text for one field. Outside a TranslationProvider (demo, isolated harness) it returns the original. */
export function useTranslated(kind: TranslatableKind, id: string, field: string, text: string): Translated {
  const store = useContext(TranslationContext), locale = useLocale(), server = useContext(ServerContext);
  const epoch = server?.state.data?.translationEpoch ?? 0;
  const item = useMemo<Item>(() => ({ kind, id, field, target: locale }), [kind, id, field, locale]);
  const key = store && text.trim() ? entryKey(item, text, epoch) : null;
  useEffect(() => { if (!store || !key) return; store.register(key, item); return () => store.unregister(key); }, [store, key, item]);
  const entry = useSyncExternalStore(store?.subscribe ?? (() => () => {}), () => (store && key ? store.entries.get(key) : undefined), () => undefined);
  const isTranslated = !!entry && (entry.status === 'ready' || entry.status === 'corrected') && entry.text !== undefined;
  return {
    text: isTranslated ? entry!.text! : text, original: text, translation: entry?.status === 'unsure' ? entry.text : isTranslated ? entry!.text : undefined,
    status: entry?.status ?? (key ? 'pending' : 'same'), isTranslated, sourceLocale: entry?.sourceLocale ?? 'unknown', reason: entry?.reason, stale: !!entry?.stale,
    retry: () => { if (store && key) store.retry(key); }, key,
  };
}
export function useTranslationStore(): TranslationStore | null { return useContext(TranslationContext); }

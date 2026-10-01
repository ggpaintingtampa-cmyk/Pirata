// P13: the client translation store batches lookups, translates only what stays mounted, re-keys on edits and epochs,
// and never persists anything. Pure store tests; the React hook is a thin subscription over it.
import { describe, expect, it, vi } from 'vitest';
import { TranslationStore, entryKey, textHash } from '../../src/i18n/translated';
import type { TranslationResponse } from '@pirata/contracts/index';

const flush = () => new Promise(resolve => setTimeout(resolve, 200));
function fakeService(behaviour: { translateReason?: 'disabled' | 'budget'; fail?: boolean } = {}) {
  const calls: { path: string; body: { target: string; items: { kind: string; id: string; field: string }[] } }[] = [];
  return { calls, call: vi.fn(async (path: string, body?: unknown) => {
    const request = body as { target: 'en' | 'es'; items: { kind: string; id: string; field: string }[] };
    calls.push({ path, body: request });
    if (behaviour.fail) throw new Error('offline');
    const items = request.items.map(item => path === 'translations/lookup'
      ? { ...item, status: item.id.startsWith('same') ? 'same' as const : 'pending' as const, sourceLocale: 'en' as const, confidence: 90 }
      : behaviour.translateReason ? { ...item, status: 'unavailable' as const, reason: behaviour.translateReason, sourceLocale: 'en' as const, confidence: 0 } : { ...item, status: 'ready' as const, text: '[' + request.target + '] ' + item.id, sourceLocale: 'en' as const, confidence: 90 });
    return { revision: 1, epoch: 0, items } satisfies TranslationResponse as never;
  }) };
}
const item = (id: string) => ({ kind: 'task' as const, id, field: 'title', target: 'es' as const });

describe('translation store', () => {
  it('batches mounted keys into one lookup, then translates only the pending ones', async () => {
    const service = fakeService(), store = new TranslationStore(service, () => 1000);
    const a = entryKey(item('a'), 'Paint the wall', 0), same = entryKey(item('same-1'), 'Pintar', 0);
    store.register(a, item('a')); store.register(same, item('same-1'));
    expect(service.call).not.toHaveBeenCalled();
    await flush();
    expect(service.calls.map(c => c.path)).toEqual(['translations/lookup', 'translations/translate']);
    expect(service.calls[0].body.items).toHaveLength(2);
    expect(service.calls[1].body.items.map(i => i.id)).toEqual(['a']);
    expect(store.entries.get(a)).toMatchObject({ status: 'ready', text: '[es] a' });
    expect(store.entries.get(same)).toMatchObject({ status: 'same' });
  });
  it('does not translate a key that was unmounted before the batch ran, and dedupes repeated mounts', async () => {
    const service = fakeService(), store = new TranslationStore(service, () => 1000);
    const a = entryKey(item('a'), 'Paint', 0), b = entryKey(item('b'), 'Tape', 0);
    store.register(a, item('a')); store.register(a, item('a')); store.register(b, item('b')); store.unregister(b);
    await flush();
    expect(service.calls[0].body.items.map(i => i.id)).toEqual(['a']);
    store.unregister(a); store.unregister(a);
    store.register(a, item('a'));
    await flush();
    expect(service.calls).toHaveLength(2);
  });
  it('re-keys when the text or the owner epoch changes', () => {
    expect(entryKey(item('a'), 'Paint', 0)).not.toBe(entryKey(item('a'), 'Paint!', 0));
    expect(entryKey(item('a'), 'Paint', 0)).not.toBe(entryKey(item('a'), 'Paint', 1));
    expect(textHash('abc')).toBe(textHash('abc'));
    expect(textHash('abc')).not.toBe(textHash('abd'));
  });
  it('pauses provider calls after a disabled or budget answer and resumes on retry', async () => {
    const service = fakeService({ translateReason: 'budget' });
    let clock = 1000;
    const store = new TranslationStore(service, () => clock);
    const a = entryKey(item('a'), 'Paint', 0);
    store.register(a, item('a'));
    await flush();
    expect(store.entries.get(a)).toMatchObject({ status: 'unavailable', reason: 'budget' });
    const b = entryKey(item('b'), 'Tape', 0);
    store.register(b, item('b'));
    await flush();
    expect(service.calls.filter(c => c.path === 'translations/translate')).toHaveLength(1);
    clock += 6 * 60 * 1000;
    store.retry(b);
    await flush();
    expect(service.calls.filter(c => c.path === 'translations/translate')).toHaveLength(2);
  });
  it('marks entries unavailable:offline when the service fails and clears everything on sign-out', async () => {
    const service = fakeService({ fail: true }), store = new TranslationStore(service, () => 1000);
    const a = entryKey(item('a'), 'Paint', 0);
    store.register(a, item('a'));
    await flush();
    expect(store.entries.get(a)).toMatchObject({ status: 'unavailable', reason: 'offline' });
    store.clear();
    expect(store.entries.size).toBe(0);
  });
});

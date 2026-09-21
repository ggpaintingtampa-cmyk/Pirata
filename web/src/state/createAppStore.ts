import type { AppState } from '../domain/types';
import { applyCommand, type Command } from '../domain/commands';
import { validateState } from '../domain/schema';
import { createDemoState } from '../data/demo';
import type { Repository } from '../data/repository';
export interface Snapshot {
  data: AppState | null;
  mode: 'loading' | 'ready' | 'recovery' | 'unavailable' | 'memory' | 'conflict';
  error: string | null;
  raw: string | null;
}
export type SaveResult = { ok: true } | { ok: false; error: string };
const message = (error: unknown) => error instanceof Error ? error.message : 'Unknown storage error.';
export function createAppStore(repository: Repository, now: () => number = Date.now) {
  let snapshot: Snapshot = { data: null, mode: 'loading', error: null, raw: null };
  let initialized = false;
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => { snapshot = next; listeners.forEach(listener => listener()); };
  const conflict = () => publish({ ...snapshot, mode: 'conflict', error: 'This demo changed in another tab. Reload to continue.' });
  const fail = (error: string): SaveResult => { publish({ ...snapshot, error }); return { ok: false, error }; };
  const persist = (data: AppState): SaveResult => {
    if (snapshot.mode === 'conflict') return { ok: false, error: snapshot.error! };
    try {
      const validated = validateState(data);
      const raw = JSON.stringify(validated);
      if (snapshot.mode !== 'memory') {
        if (repository.read() !== snapshot.raw) { conflict(); return { ok: false, error: snapshot.error! }; }
        repository.write(raw);
      }
      publish({ data: validated, mode: snapshot.mode === 'memory' ? 'memory' : 'ready', error: null, raw: snapshot.mode === 'memory' ? snapshot.raw : raw });
      return { ok: true };
    } catch (error) { return fail('Could not save. Your changes were not applied. ' + message(error)); }
  };
  const unsubscribeRepository = repository.subscribe(() => {
    if (snapshot.mode !== 'memory') conflict();
  });
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize() {
      if (initialized) return;
      initialized = true;
      let raw: string | null;
      try { raw = repository.read(); }
      catch { publish({ ...snapshot, mode: 'unavailable', error: 'Browser storage is unavailable. You can explicitly use an in-memory demo.' }); return; }
      if (raw === null) {
        const data = validateState(createDemoState(now()));
        try {
          const serialized = JSON.stringify(data);
          repository.write(serialized);
          publish({ data, mode: 'ready', error: null, raw: serialized });
        } catch { publish({ data: null, mode: 'unavailable', raw: null, error: 'Browser storage is unavailable. You can explicitly use an in-memory demo.' }); }
      } else {
        try { publish({ data: validateState(JSON.parse(raw)), mode: 'ready', error: null, raw }); }
        catch { publish({ data: null, mode: 'recovery', raw, error: 'Saved demo data could not be read or uses an unsupported version. The original content has been preserved.' }); }
      }
    },
    execute(command: Command): SaveResult {
      if (!snapshot.data || !['ready', 'memory'].includes(snapshot.mode)) return { ok: false, error: snapshot.error ?? 'Editing is unavailable.' };
      try {
        const next = applyCommand(snapshot.data, command, now());
        if (JSON.stringify(next) === JSON.stringify(snapshot.data)) return { ok: true };
        return persist(next);
      } catch (error) { return fail(message(error)); }
    },
    reset(): SaveResult { return persist(createDemoState(now())); },
    useMemory() {
      if (snapshot.mode !== 'unavailable') return;
      publish({ data: validateState(createDemoState(now())), mode: 'memory', raw: snapshot.raw, error: null });
    },
    dispose() { unsubscribeRepository(); listeners.clear(); },
  };
}
export type AppStore = ReturnType<typeof createAppStore>;

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AppStore } from './createAppStore';
import type { Command } from '../domain/commands';
import type { AttentionItem } from '../domain/selectors';
import { initialTaskId } from '../domain/selectors';
import { businessDate } from '../lib/dates';
export type QuickKind = 'task' | 'expense' | 'time' | 'material' | 'lead';
export type Dialog =
  | { kind: 'objectives' } | { kind: 'task'; id: string } | { kind: 'schedule'; id: string }
  | { kind: 'timeEntries'; id: string } | { kind: 'attention'; item: AttentionItem }
  | { kind: 'expenses' } | { kind: 'demo' }
  | { kind: 'quick'; form?: QuickKind; recordId?: string; taskId?: string; materialId?: string }
  | { kind: 'switch'; taskId: string } | { kind: 'clock' };
function useApplication(store: AppStore) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [now, setNow] = useState(Date.now);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => snapshot.data ? initialTaskId(snapshot.data, businessDate(Date.now())) : null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const date = businessDate(now);
  const data = snapshot.data;
  const selected = data ? data.tasks.find(t => t.id === selectedTaskId) ?? data.tasks.find(t => t.id === initialTaskId(data, date)) ?? null : null;
  function execute(command: Command, success: string, close = true) {
    const result = store.execute(command);
    if (result.ok) {
      setAnnouncement(success);
      if (close) setDialog(null);
    }
    return result;
  }
  return { store, snapshot, state: snapshot.data, now, date, selected, selectedTaskId, setSelectedTaskId, dialog, setDialog, announcement, setAnnouncement, execute };
}
type AppContextValue = ReturnType<typeof useApplication>;
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  const value = useApplication(store);
  return <AppContext value={value}>{children}</AppContext>;
}
// A colocated hook keeps the single store/context explicit for this small prototype.
// eslint-disable-next-line react-refresh/only-export-components
export function useApp() { const app = useContext(AppContext); if (!app) throw new Error('AppProvider is required.'); return app; }

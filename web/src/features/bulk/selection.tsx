// Update 2026-09-29 (P03/P09): one selection shared by every list that can be selected from. The bar at the bottom offers
// Copy to… (tasks) and Move to trash (owner). Selection lives in memory only and is cleared on navigation and sign-out.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import type { Task, TrashKind } from '@pirata/contracts/index';
import { useT } from '../../i18n';
export interface Selected { kind: TrashKind; id: string; label: string }
export interface Selection { active: boolean; items: Selected[]; start(): void; stop(): void; toggle(item: Selected): void; has(kind: TrashKind, id: string): boolean; remove(kind: TrashKind, id: string): void; clear(): void }
const SelectionContext = createContext<Selection | null>(null);
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false), [items, setItems] = useState<Selected[]>([]);
  const key = (kind: TrashKind, id: string) => kind + ':' + id;
  const toggle = useCallback((item: Selected) => setItems(list => list.some(i => key(i.kind, i.id) === key(item.kind, item.id)) ? list.filter(i => key(i.kind, i.id) !== key(item.kind, item.id)) : [...list, item]), []);
  const value = useMemo<Selection>(() => ({
    active, items, start: () => setActive(true), stop: () => { setActive(false); setItems([]); }, toggle,
    has: (kind, id) => items.some(i => i.kind === kind && i.id === id), remove: (kind, id) => setItems(list => list.filter(i => !(i.kind === kind && i.id === id))), clear: () => setItems([]),
  }), [active, items, toggle]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}
/** Null outside the live shell (demo, isolated harnesses): lists then render no selection controls. */
export function useSelection(): Selection | null { return useContext(SelectionContext); }
/** A checkbox rendered before a row while selecting. */
export function SelectBox({ kind, id, label }: { kind: TrashKind; id: string; label: string }) {
  const t = useT(), selection = useSelection();
  if (!selection?.active) return null;
  const checked = selection.has(kind, id);
  return <button type="button" className={'bulk-select-box' + (checked ? ' is-checked' : '')} role="checkbox" aria-checked={checked} aria-label={t('bulk.selectItem', { label })} onClick={() => selection.toggle({ kind, id, label })}>{checked ? <CheckSquare size={18} aria-hidden="true" /> : <Square size={18} aria-hidden="true" />}</button>;
}
/** The toolbar control that enters or leaves selection mode. */
export function SelectToggle({ className = 'work-link-button' }: { className?: string }) {
  const t = useT(), selection = useSelection();
  if (!selection) return null;
  return <button type="button" className={className} aria-pressed={selection.active} onClick={() => selection.active ? selection.stop() : selection.start()}>{selection.active ? t('bulk.doneSelecting') : t('bulk.select')}</button>;
}
/** Mirror of the server's normalisation: a task under another selected task copies with it. */
export function normalizeTaskRoots(all: readonly Task[], ids: readonly string[]): string[] {
  const chosen = new Set(ids), byId = new Map(all.map(task => [task.id, task]));
  const hasSelectedAncestor = (id: string): boolean => { for (let parent = byId.get(id)?.parentTaskId ?? null; parent; parent = byId.get(parent)?.parentTaskId ?? null) if (chosen.has(parent)) return true; return false; };
  const out: string[] = [];
  for (const id of ids) if (!out.includes(id) && !hasSelectedAncestor(id)) out.push(id);
  return out;
}
/** Live descendants of a task (the task itself excluded). */
export function liveDescendants(all: readonly Task[], id: string): Task[] {
  const out: Task[] = [];
  const walk = (parentId: string) => { for (const child of all) if (child.parentTaskId === parentId && !child.archivedAt) { out.push(child); walk(child.id); } };
  walk(id); return out;
}
export const subtreeDepth = (all: readonly Task[], id: string): number => { const children = all.filter(t => t.parentTaskId === id && !t.archivedAt); return children.length ? 1 + Math.max(...children.map(child => subtreeDepth(all, child.id))) : 0; };

import type { AppState, ScheduleBlock, Task } from './types.js';
import { entryMilliseconds, formatDuration } from '../lib/time.js';
export const projectName = (s: AppState, id: string | null) => s.projects.find(p => p.id === id)?.name ?? 'General business';
export const todaysObjectives = (s: AppState, date: string) => s.objectives.filter(o => o.date === date).sort((a, b) => a.rank - b.rank);
export const timeline = (s: AppState, date: string) => s.schedule.filter(b => b.date === date).sort((a, b) => a.startMinute - b.startMinute);
export const overlaps = (s: AppState, block: Pick<ScheduleBlock, 'date' | 'startMinute' | 'endMinute'> & { id?: string; taskId?: string | null }) => s.schedule.filter(b => b.id !== block.id && (!block.taskId || b.taskId !== block.taskId) && b.date === block.date && b.startMinute < block.endMinute && block.startMinute < b.endMinute);
export const openTasks = (s: AppState) => s.tasks.filter(t => t.status === 'open').sort((a, b) => a.createdAt - b.createdAt);
export function initialTaskId(s: AppState, date: string): string | null {
  return s.runningTimer?.taskId ?? timeline(s, date).find(b => s.tasks.find(t => t.id === b.taskId)?.status === 'open')?.taskId ?? openTasks(s)[0]?.id ?? null;
}
export function actualTaskTime(s: AppState, taskId: string, now: number): number {
  return s.timeEntries.filter(e => e.taskId === taskId).reduce((sum, e) => sum + entryMilliseconds(e), 0) + (s.runningTimer?.taskId === taskId ? Math.max(0, now - s.runningTimer.startedAt) : 0);
}
export function estimateVariance(task: Task, actualMs: number): string | null {
  const delta = actualMs - task.estimatedMinutes * 60000;
  if (delta > 0) return formatDuration(delta) + ' over estimate';
  if (task.status !== 'done') return null;
  return delta === 0 ? 'Finished on estimate' : formatDuration(-delta) + ' under estimate';
}
export const todaysExpenses = (s: AppState, date: string) => s.expenses.filter(e => e.purchaseDate === date).sort((a, b) => b.createdAt - a.createdAt);
export const spendingTotal = (s: AppState, date: string) => todaysExpenses(s, date).reduce((sum, e) => sum + e.amountCents, 0);
export interface Shortage { requirementId: string; materialId: string; projectId: string; missingMinor: number; allocatedMinor: number; neededMinor: number; reservedMinor: number }
export function materialShortages(s: AppState): Shortage[] {
  const remaining = new Map(s.materials.map(m => [m.id, m.stockMinor - s.materialRequirements.filter(r => r.materialId === m.id).reduce((sum, r) => sum + r.reservedMinor, 0)]));
  const result: Shortage[] = [];
  // Project and requirement array order is stable and persisted.
  for (const project of s.projects) for (const r of s.materialRequirements.filter(r => r.projectId === project.id)) {
    const need = r.neededMinor - r.reservedMinor, free = remaining.get(r.materialId) ?? 0;
    const allocated = Math.min(need, free);
    remaining.set(r.materialId, free - allocated);
    if (need > allocated) result.push({ requirementId: r.id, materialId: r.materialId, projectId: r.projectId, missingMinor: need - allocated, allocatedMinor: allocated, neededMinor: r.neededMinor, reservedMinor: r.reservedMinor });
  }
  return result;
}
export type AttentionItem = { id: string; kind: 'maintenance' | 'shortage' | 'lead'; title: string; detail: string; dueDate: string | null; overdue: boolean };
export function quantityLabel(minor: number, unit: 'gal' | 'piece'): string {
  const amount = minor / 100; return amount + ' ' + (unit === 'gal' ? (amount === 1 ? 'gallon' : 'gallons') : (amount === 1 ? 'piece' : 'pieces'));
}
export function attentionItems(s: AppState, date: string): AttentionItem[] {
  const items: AttentionItem[] = [
    ...s.maintenance.filter(m => m.completedAt === null && m.dueDate <= date).map(m => ({ id: m.id, kind: 'maintenance' as const, title: m.title, detail: m.equipmentName, dueDate: m.dueDate, overdue: m.dueDate < date })),
    ...materialShortages(s).map(r => { const m = s.materials.find(m => m.id === r.materialId)!; return { id: r.requirementId, kind: 'shortage' as const, title: 'Need ' + quantityLabel(r.missingMinor, m.unit) + ' of ' + m.name.toLowerCase(), detail: projectName(s, r.projectId), dueDate: null, overdue: false }; }),
    ...s.leads.filter(l => l.nextFollowUpDate !== null && l.nextFollowUpDate <= date).map(l => ({ id: l.id, kind: 'lead' as const, title: 'Follow up with ' + l.name, detail: l.workDescription, dueDate: l.nextFollowUpDate, overdue: l.nextFollowUpDate! < date })),
  ];
  const rank = { maintenance: 0, shortage: 1, lead: 2 };
  return items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.overdue && b.overdue ? (a.dueDate ?? '').localeCompare(b.dueDate ?? '') : 0) || rank[a.kind] - rank[b.kind]);
}

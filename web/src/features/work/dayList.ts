import { can, subtree, type BusinessSnapshot, type DayAssignment, type Role, type Task } from '@pirata/contracts/index';
export const UNDO_WINDOW_MS = 10 * 60 * 1000;
/** Mirrors the server rule: a done task is editable by an owner, or by its completer for ten minutes. */
export function canEditDone(task: Task, userId: string | undefined, role: Role | undefined, now: number): boolean {
  if (task.status !== 'done' || can(role, 'task.editDone')) return true;
  return Boolean(userId) && task.completedBy === userId && typeof task.completedAt === 'number' && now - task.completedAt <= UNDO_WINDOW_MS;
}
/** Leaves of the subtree that are done, over all leaves (a node without children is its own leaf). */
export function treeCompletion(tasks: readonly Task[], id: string): { done: number; total: number; fraction: number } {
  const nodes = subtree(tasks, id), leaves = nodes.filter(node => !nodes.some(child => child.parentTaskId === node.id));
  const done = leaves.filter(leaf => leaf.status === 'done').length;
  return { done, total: leaves.length, fraction: leaves.length ? done / leaves.length : 0 };
}
export interface DayGroup { projectId: string; name: string; rows: DayAssignment[] }
/** Rows grouped by project in order of first appearance (the list order is the plan's order). */
export function groupByProject(snapshot: Pick<BusinessSnapshot, 'projects'>, rows: readonly DayAssignment[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of rows) {
    let group = groups.find(item => item.projectId === row.projectId);
    if (!group) { group = { projectId: row.projectId, name: snapshot.projects.find(project => project.id === row.projectId)?.name ?? '—', rows: [] }; groups.push(group); }
    group.rows.push(row);
  }
  return groups;
}
export type DayGroupMode = 'time' | 'project';
export interface TimeGroup { startMinute: number | null; projects: DayGroup[] }
/** P01: a row's time on `date` is its own schedule block that day, else the nearest ancestor's block that day, else null (unscheduled). */
export function rowStartMinute(snapshot: Pick<BusinessSnapshot, 'schedule' | 'tasks'>, taskId: string | null, date: string): number | null {
  let id: string | null = taskId;
  for (let depth = 0; id && depth < 32; depth++) {
    const blocks = snapshot.schedule.filter(block => block.taskId === id && block.date === date);
    if (blocks.length) return Math.min(...blocks.map(block => block.startMinute));
    id = snapshot.tasks.find(task => task.id === id)?.parentTaskId ?? null;
  }
  return null;
}
/** P01: rows grouped by start time (ascending, unscheduled last), then by project in first-appearance order; rows keep the plan's order. */
export function groupByTimeThenProject(snapshot: Pick<BusinessSnapshot, 'projects' | 'schedule' | 'tasks'>, rows: readonly DayAssignment[], date: string): TimeGroup[] {
  const groups: TimeGroup[] = [];
  for (const row of rows) {
    const startMinute = rowStartMinute(snapshot, row.taskId, date);
    let group = groups.find(item => item.startMinute === startMinute);
    if (!group) { group = { startMinute, projects: [] }; groups.push(group); }
    let project = group.projects.find(item => item.projectId === row.projectId);
    if (!project) { project = { projectId: row.projectId, name: snapshot.projects.find(item => item.id === row.projectId)?.name ?? '—', rows: [] }; group.projects.push(project); }
    project.rows.push(row);
  }
  return groups.sort((a, b) => a.startMinute === b.startMinute ? 0 : a.startMinute === null ? 1 : b.startMinute === null ? -1 : a.startMinute - b.startMinute);
}
/** P06: the rows in render order, so display numbers always read top to bottom. */
export function flattenGroups(groups: readonly (TimeGroup | DayGroup)[]): DayAssignment[] {
  return groups.flatMap(group => 'projects' in group ? group.projects.flatMap(project => project.rows) : group.rows);
}
export interface WorkedRow { userId: string; name: string; minutes: number; daysMinor: number; entries: number; approved: number; submitted: number }
/** P08: one row per person with at least one non-rejected hours entry on `date`. Entries aggregate once; task timers are never included.
 *  `minutes` is the server's per-entry total (a day entry already counts its standard-day minutes); `daysMinor` keeps day entries visible as days. */
export function whoWorked(snapshot: Pick<BusinessSnapshot, 'workShifts' | 'team'>, date: string): WorkedRow[] {
  const rows = new Map<string, WorkedRow>();
  for (const shift of snapshot.workShifts ?? []) {
    if (shift.date !== date || shift.status === 'rejected') continue;
    const row = rows.get(shift.userId) ?? { userId: shift.userId, name: snapshot.team?.find(member => member.id === shift.userId)?.name ?? '—', minutes: 0, daysMinor: 0, entries: 0, approved: 0, submitted: 0 };
    row.minutes += shift.minutes; row.entries += 1;
    if (shift.kind === 'day') row.daysMinor += shift.daysMinor ?? 0;
    if (shift.status === 'approved') row.approved += 1; else row.submitted += 1;
    rows.set(shift.userId, row);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
}
/** The session id to confirm when my running timer sits on the node or inside its subtree. */
export function affectedSession(snapshot: Pick<BusinessSnapshot, 'runningTimer' | 'tasks'>, taskId: string): string | null {
  const timer = snapshot.runningTimer;
  if (!timer) return null;
  return subtree(snapshot.tasks, taskId).some(node => node.id === timer.taskId) ? timer.sessionId : null;
}
export const scopeKey = (scope: { kind: 'person'; userId: string } | { kind: 'project'; projectId: string }) => scope.kind === 'person' ? 'person:' + scope.userId : 'project:' + scope.projectId;
export function parseScope(key: string): { kind: 'person'; userId: string } | { kind: 'project'; projectId: string } | null {
  const [kind, id] = key.split(':');
  if (!id) return null;
  return kind === 'person' ? { kind: 'person', userId: id } : kind === 'project' ? { kind: 'project', projectId: id } : null;
}

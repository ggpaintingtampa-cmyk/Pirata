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

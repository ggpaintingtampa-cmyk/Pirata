import type { BusinessSnapshot, Task } from '@pirata/contracts/index';

export interface WorkTaskFilters {
  scope: 'assigned' | 'today';
  status: 'active' | 'done' | 'all';
  person: string;
  project: string;
  query: string;
}

export const defaultWorkFilters: WorkTaskFilters = {
  scope: 'assigned', status: 'active', person: 'all', project: 'all', query: '',
};

/** Today selects goals and scheduled work; viewing/filtering never changes the plan. */
export function selectWorkTasks(snapshot: BusinessSnapshot, date: string, filters: WorkTaskFilters) {
  const byId = new Map(snapshot.tasks.map(task => [task.id, task]));
  const owner = snapshot.currentUser?.role === 'owner';
  const personalGoals = new Set((snapshot.dailyGoals ?? []).filter(goal => goal.date === date && goal.userId === snapshot.currentUser?.id).map(goal => goal.taskId));
  const dailyIds = new Set([
    ...(snapshot.dailyGoals ?? []).filter(goal => goal.date === date && (owner || goal.userId === snapshot.currentUser?.id)).map(goal => goal.taskId),
    ...snapshot.schedule.filter(block => block.date === date && block.taskId).map(block => block.taskId!),
  ]);
  const query = filters.query.trim().toLocaleLowerCase();
  return snapshot.tasks.filter(task => {
    const parent = task.parentTaskId ? byId.get(task.parentTaskId) : undefined;
    const projectId = task.projectId ?? parent?.projectId;
    if (task.archivedAt != null || parent?.archivedAt != null) return false;
    const unassignedPersonalGoal = filters.scope === 'today' && !task.assigneeId && (personalGoals.has(task.id) || Boolean(parent && personalGoals.has(parent.id)));
    if (!owner && (!snapshot.currentUser || task.assigneeId !== snapshot.currentUser.id && !unassignedPersonalGoal)) return false;
    if (filters.scope === 'today' && !dailyIds.has(task.id) && !(parent && dailyIds.has(parent.id))) return false;
    if (filters.status === 'active' && task.status === 'done' || filters.status === 'done' && task.status !== 'done') return false;
    if (owner && filters.person !== 'all' && (filters.person === 'unassigned' ? Boolean(task.assigneeId) : task.assigneeId !== filters.person)) return false;
    if (filters.project !== 'all' && (filters.project === 'unfiled' ? Boolean(projectId) : projectId !== filters.project)) return false;
    return !query || [task.title, task.note, parent?.title ?? '', snapshot.projects.find(project => project.id === projectId)?.name ?? ''].some(value => value.toLocaleLowerCase().includes(query));
  }).sort((a, b) => {
    if (a.status === 'done' && b.status === 'done') return b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
    if (a.status === 'done' || b.status === 'done') return a.status === 'done' ? 1 : -1;
    return 0;
  });
}

export function groupWorkTasks(snapshot: BusinessSnapshot, tasks: Task[]) {
  const team = [...(snapshot.team ?? [])].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.name.localeCompare(b.name));
  return [
    ...team.map(person => ({ id: person.id, name: person.name + (person.disabledAt != null ? ' (inactive)' : ''), tasks: tasks.filter(task => task.assigneeId === person.id) })),
    ...[...new Set(tasks.map(task => task.assigneeId).filter((id): id is string => Boolean(id) && !team.some(person => person.id === id)))].map(id => ({ id, name: 'Unavailable team member', tasks: tasks.filter(task => task.assigneeId === id) })),
    { id: 'unassigned', name: 'Unassigned', tasks: tasks.filter(task => !task.assigneeId) },
  ].filter(group => group.tasks.length);
}

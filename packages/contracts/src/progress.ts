import type { Task } from './index.js';

/** Checklist fractions are deliberately independent of estimates and timer entries. */
export function taskCompletion(task: Task, tasks: readonly Task[]): number {
  const children = tasks.filter(child => child.parentTaskId === task.id && !child.archivedAt);
  return children.length ? children.filter(child => child.status === 'done').length / children.length : task.status === 'done' ? 1 : 0;
}

export function projectCompletion(projectId: string, tasks: readonly Task[]): number | null {
  const goals = tasks.filter(task => task.projectId === projectId && !task.parentTaskId && !task.archivedAt);
  return goals.length ? goals.reduce((sum, task) => sum + taskCompletion(task, tasks), 0) / goals.length : null;
}

export function dailyCompletion(taskIds: readonly string[], tasks: readonly Task[]): number | null {
  const goals = taskIds.map(id => tasks.find(task => task.id === id && !task.archivedAt)).filter((task): task is Task => Boolean(task));
  return goals.length ? goals.reduce((sum, task) => sum + taskCompletion(task, tasks), 0) / goals.length : null;
}

export function completionPercent(fraction: number): number { return Math.round(fraction * 100); }

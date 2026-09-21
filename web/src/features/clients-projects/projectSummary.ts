import type { BusinessSnapshot } from '@pirata/contracts/index';
import { toLegacyState } from '@pirata/contracts/compatibility';
import { actualTaskTime } from '@pirata/domain/domain/selectors';

export function projectSummary(snapshot: BusinessSnapshot, projectId: string) {
  const legacy = toLegacyState(snapshot);
  const tasks = snapshot.tasks.filter(task => task.projectId === projectId);
  const expenses = snapshot.expenses.filter(expense => expense.projectId === projectId);
  return {
    tasks, expenses,
    outstanding: tasks.filter(task => task.status !== 'done'),
    loggedMs: tasks.reduce((sum, task) => sum + actualTaskTime(legacy, task.id, snapshot.serverNow), 0),
    spendingCents: expenses.reduce((sum, expense) => sum + expense.amountCents, 0),
    reservations: snapshot.materialRequirements.filter(requirement => requirement.projectId === projectId && requirement.reservedMinor > 0),
    hasRunningTimer: tasks.some(task => task.id === snapshot.runningTimer?.taskId),
  };
}

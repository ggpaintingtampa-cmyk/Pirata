import type { AppState, Expense, Lead, MaterialAdjustment, Objective, ScheduleBlock, Task, TimeEntry } from './types.js';
import { validateState } from './schema.js';
export type Command =
  | { type: 'objectives'; date: string; objectives: Objective[] }
  | { type: 'task'; task: Task; block?: ScheduleBlock }
  | { type: 'schedule'; taskId: string; block: ScheduleBlock | null }
  | { type: 'start'; taskId: string; sessionId: string; now: number; switchConfirmed?: boolean }
  | { type: 'pause'; now: number }
  | { type: 'correctTimer'; startedAt: number; now: number }
  | { type: 'discardTimer' }
  | { type: 'expense'; expense: Expense }
  | { type: 'timeEntry'; entry: TimeEntry }
  | { type: 'materialAdjustment'; adjustment: MaterialAdjustment }
  | { type: 'maintenance'; id: string; now: number }
  | { type: 'lead'; lead: Lead }
  | { type: 'followUp'; leadId: string; id: string; now: number; note: string; nextDate: string | null };
function upsert<T extends { id: string }>(records: T[], record: T) {
  const index = records.findIndex(r => r.id === record.id);
  if (index === -1) records.push(record); else records[index] = record;
}
function closeTimer(s: AppState, now: number) {
  const timer = s.runningTimer;
  if (!timer) return;
  if (now < timer.startedAt) throw new Error('The system clock moved backward. Correct the active start time or discard the session before continuing.');
  if (now > timer.startedAt && !s.timeEntries.some(e => e.id === timer.sessionId)) s.timeEntries.push({ id: timer.sessionId, taskId: timer.taskId, source: 'timer', startedAt: timer.startedAt, endedAt: now, note: '' });
  s.runningTimer = null;
}
export function applyCommand(previous: AppState, command: Command, now: number = Date.now()): AppState {
  const s = structuredClone(previous);
  switch (command.type) {
    case 'objectives':
      if (command.objectives.some(o => o.date !== command.date)) throw new Error('Objectives must belong to the selected date.');
      s.objectives = [...s.objectives.filter(o => o.date !== command.date), ...command.objectives]; break;
    case 'task': {
      const existing = s.tasks.find(t => t.id === command.task.id);
      if (existing && s.runningTimer?.taskId === existing.id && command.task.status !== 'open') closeTimer(s, now);
      upsert(s.tasks, command.task);
      s.schedule.filter(b => b.taskId === command.task.id).forEach(b => { b.title = command.task.title; });
      if (command.block) {
        if (command.block.taskId !== command.task.id) throw new Error('Scheduled block must belong to this task.');
        s.schedule = s.schedule.filter(b => b.taskId !== command.task.id);
        s.schedule.push(command.block);
      }
      break;
    }
    case 'schedule':
      if (!s.tasks.some(t => t.id === command.taskId)) throw new Error('Task not found.');
      if (command.block && command.block.taskId !== command.taskId) throw new Error('Scheduled block must belong to this task.');
      s.schedule = s.schedule.filter(b => b.taskId !== command.taskId);
      if (command.block) s.schedule.push(command.block);
      break;
    case 'start':
      if (s.runningTimer?.taskId === command.taskId) return previous;
      if (s.timeEntries.some(e => e.id === command.sessionId)) return previous;
      if (s.tasks.find(t => t.id === command.taskId)?.status !== 'open') throw new Error('Reopen this task before starting a timer.');
      if (s.runningTimer && !command.switchConfirmed) throw new Error('Confirm pausing the current task before switching.');
      closeTimer(s, command.now);
      s.runningTimer = { sessionId: command.sessionId, taskId: command.taskId, startedAt: command.now }; break;
    case 'pause': closeTimer(s, command.now); break;
    case 'correctTimer':
      if (!s.runningTimer) throw new Error('There is no running timer.');
      if (command.startedAt > command.now) throw new Error('Start must be at or before the current time.');
      s.runningTimer.startedAt = command.startedAt; break;
    case 'discardTimer': s.runningTimer = null; break;
    case 'expense': upsert(s.expenses, command.expense); break;
    case 'timeEntry': {
      const existing = s.timeEntries.find(e => e.id === command.entry.id);
      if (existing && (existing.source !== command.entry.source || existing.taskId !== command.entry.taskId)) throw new Error('Keep the original task and source when correcting a time entry.');
      upsert(s.timeEntries, command.entry); break;
    }
    case 'materialAdjustment': {
      const a = command.adjustment;
      if (s.materialAdjustments.some(existing => existing.id === a.id)) return previous;
      const material = s.materials.find(m => m.id === a.materialId);
      if (!material) throw new Error('Material not found.');
      material.stockMinor += a.deltaMinor; s.materialAdjustments.push(a); break;
    }
    case 'maintenance': {
      const item = s.maintenance.find(m => m.id === command.id);
      if (!item) throw new Error('Maintenance item not found.');
      item.completedAt ??= command.now; break;
    }
    case 'lead': upsert(s.leads, command.lead); break;
    case 'followUp': {
      const lead = s.leads.find(l => l.id === command.leadId);
      if (!lead) throw new Error('Lead not found.');
      if (lead.followUps.some(f => f.id === command.id)) return previous;
      lead.followUps.push({ id: command.id, at: command.now, note: command.note });
      lead.nextFollowUpDate = command.nextDate; break;
    }
  }
  return validateState(s);
}

import { businessDate } from '@pirata/domain/lib/dates';
import { laborCostCents, presence, type BusinessSnapshot, type DayNote, type EquipmentReport, type Expense, type ShoppingItem, type Task, type TaskQuestion, type ToolSignOut, type WorkShift } from '@pirata/contracts/index';
export interface ReportFilter { date: string; projectId?: string; userId?: string }
export interface ToolEvent { signOut: ToolSignOut; kind: 'taken' | 'returned' }
export interface ReportData {
  completed: Task[]; shifts: WorkShift[]; missingHours: { userId: string; projectId: string }[]; notes: DayNote[]; questions: TaskQuestion[]; requests: ShoppingItem[]; tools: ToolEvent[]; broken: EquipmentReport[]; expenses: Expense[]; labor: { projectId: string; minutes: number; cents: number }[];
}
/** Everything that happened on one business day, filtered by project and person. Pure so it can be unit-tested. */
export function reportData(snapshot: BusinessSnapshot, filter: ReportFilter): ReportData {
  const { date, projectId, userId } = filter;
  const byProject = (id: string | null | undefined) => !projectId || id === projectId, byUser = (id: string | null | undefined) => !userId || id === userId;
  const onDate = (ms: number | null | undefined) => typeof ms === 'number' && businessDate(ms) === date;
  const completed = snapshot.tasks.filter(task => !task.archivedAt && onDate(task.completedAt) && byProject(task.projectId) && byUser(task.completedBy)).sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  const shifts = (snapshot.workShifts ?? []).filter(shift => shift.date === date && byProject(shift.projectId) && byUser(shift.userId));
  const missingHours: { userId: string; projectId: string }[] = [];
  for (const project of snapshot.projects.filter(p => byProject(p.id))) for (const person of presence(snapshot, date, project.id)) if (byUser(person) && !shifts.some(s => s.userId === person && s.projectId === project.id)) missingHours.push({ userId: person, projectId: project.id });
  const notes = (snapshot.dayNotes ?? []).filter(note => note.date === date && byUser(note.userId) && note.body.trim());
  const questions = (snapshot.taskQuestions ?? []).filter(q => onDate(q.createdAt) && byProject(q.projectId) && byUser(q.askedBy)).sort((a, b) => Number(Boolean(a.answeredAt)) - Number(Boolean(b.answeredAt)) || a.createdAt - b.createdAt);
  const requests = (snapshot.shoppingItems ?? []).filter(item => !item.archivedAt && onDate(item.createdAt) && byProject(item.projectId) && byUser(item.createdBy));
  const tools: ToolEvent[] = [];
  for (const signOut of snapshot.toolSignOuts ?? []) { if (!byProject(signOut.projectId) || !byUser(signOut.takenBy)) continue; if (onDate(signOut.takenAt)) tools.push({ signOut, kind: 'taken' }); if (onDate(signOut.returnedAt)) tools.push({ signOut, kind: 'returned' }); }
  const broken = (snapshot.equipmentReports ?? []).filter(report => onDate(report.createdAt) && byUser(report.reportedBy));
  const expenses = snapshot.expenses.filter(expense => expense.purchaseDate === date && byProject(expense.projectId));
  const labor = snapshot.projects.filter(p => byProject(p.id)).map(p => ({ projectId: p.id, minutes: shifts.filter(s => s.projectId === p.id && s.status === 'approved').reduce((sum, s) => sum + s.minutes, 0), cents: laborCostCents(shifts, snapshot.payRates ?? [], { projectId: p.id, from: date, to: date }) })).filter(row => row.minutes > 0);
  return { completed, shifts, missingHours, notes, questions, requests, tools, broken, expenses, labor };
}

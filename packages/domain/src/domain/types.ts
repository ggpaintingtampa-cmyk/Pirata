export type LocalDate = string;
export type TaskStatus = 'open' | 'blocked' | 'done';
export interface Project { id: string; name: string; clientName: string; status: 'open' | 'completed' }
export interface Task { id: string; projectId: string | null; title: string; estimatedMinutes: number; status: TaskStatus; note: string; createdAt: number }
export interface Objective { id: string; date: LocalDate; title: string; taskId: string | null; status: 'open' | 'partial' | 'blocked' | 'done'; note: string; rank: number }
export interface ScheduleBlock { id: string; date: LocalDate; startMinute: number; endMinute: number; kind: 'task' | 'appointment' | 'travel' | 'supply_run' | 'break' | 'cleanup'; title: string; taskId: string | null }
export interface RunningTimer { sessionId: string; taskId: string; startedAt: number }
export type TimeEntry =
  | { id: string; taskId: string; source: 'timer'; startedAt: number; endedAt: number; note: string }
  | { id: string; taskId: string; source: 'manual'; date: LocalDate; durationSeconds: number; note: string };
export interface Expense { id: string; purchaseDate: LocalDate; description: string; category: 'materials' | 'tools' | 'fuel' | 'maintenance' | 'other'; amountCents: number; projectId: string | null; createdAt: number }
export interface Material { id: string; name: string; product: string; color: string; finish: string; unit: 'gal' | 'piece'; stockMinor: number }
export interface MaterialRequirement { id: string; materialId: string; projectId: string; neededMinor: number; reservedMinor: number }
export interface MaterialAdjustment { id: string; materialId: string; deltaMinor: number; reason: 'restock' | 'usage' | 'correction'; note: string; createdAt: number }
export interface MaintenanceItem { id: string; equipmentName: string; title: string; dueDate: LocalDate; completedAt: number | null }
export interface Lead { id: string; name: string; phone: string; email: string; workDescription: string; nextFollowUpDate: LocalDate | null; followUps: { id: string; at: number; note: string }[] }
export interface AppState {
  schemaVersion: 1; timezone: 'America/New_York'; currency: 'USD'; seededOn: LocalDate;
  projects: Project[]; tasks: Task[]; objectives: Objective[]; schedule: ScheduleBlock[];
  timeEntries: TimeEntry[]; runningTimer: RunningTimer | null; expenses: Expense[];
  materials: Material[]; materialRequirements: MaterialRequirement[]; materialAdjustments: MaterialAdjustment[];
  maintenance: MaintenanceItem[]; leads: Lead[];
}

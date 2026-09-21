import { z } from 'zod';
import { isLocalDate } from '../lib/dates.js';
import { parseMoneyToCents, parseQuantity } from '../lib/money.js';
import type { AppState } from './types.js';

const id = z.string().min(1).max(100);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = integer;
export const titleSchema = z.string().trim().min(1, 'Enter a title or description.').max(160, 'Use 160 characters or fewer.');
export const nameSchema = z.string().trim().min(1, 'Enter a name.').max(100, 'Use 100 characters or fewer.');
export const noteSchema = z.string().trim().max(1000, 'Use 1,000 characters or fewer.');
export const dateSchema = z.string().refine(isLocalDate, 'Enter a valid calendar date.');
export const minutesSchema = z.number().int('Enter whole minutes.').min(1, 'Enter at least 1 minute.').max(1440, 'Use 1–1440 minutes.');
export const moneyInputSchema = z.string().refine(v => parseMoneyToCents(v) !== null, 'Enter a positive amount with up to two decimals.');
export const quantityInputSchema = z.string().refine(v => parseQuantity(v) !== null && parseQuantity(v) !== 0, 'Enter a nonzero quantity with up to two decimals.');
export const emailSchema = z.union([z.literal(''), z.email('Enter a valid email address.')]);
export const taskSchema = z.object({ id, projectId: id.nullable(), title: titleSchema, estimatedMinutes: minutesSchema, status: z.enum(['open', 'blocked', 'done']), note: noteSchema, createdAt: timestamp }).strict();
export const objectiveSchema = z.object({ id, date: dateSchema, title: titleSchema, taskId: id.nullable(), status: z.enum(['open', 'partial', 'blocked', 'done']), note: noteSchema, rank: integer }).strict().refine(o => o.status !== 'blocked' || o.note.length > 0, { path: ['note'], message: 'Explain why this objective is blocked.' });
export const scheduleSchema = z.object({ id, date: dateSchema, startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), kind: z.enum(['task', 'appointment', 'travel', 'supply_run', 'break', 'cleanup']), title: titleSchema, taskId: id.nullable() }).strict().refine(b => b.endMinute > b.startMinute, { path: ['endMinute'], message: 'End must be after start within the same day; overnight blocks are not supported.' }).refine(b => b.kind === 'task' ? b.taskId !== null : b.taskId === null, 'Task blocks must link to a task.');
export const timeEntrySchema = z.discriminatedUnion('source', [
  z.object({ id, taskId: id, source: z.literal('timer'), startedAt: timestamp, endedAt: timestamp, note: noteSchema }).strict().refine(e => e.endedAt > e.startedAt, { path: ['endedAt'], message: 'End must be after start.' }),
  z.object({ id, taskId: id, source: z.literal('manual'), date: dateSchema, durationSeconds: z.number().int().min(60).max(86400).multipleOf(60), note: noteSchema }).strict(),
]);
export const expenseSchema = z.object({ id, purchaseDate: dateSchema, description: titleSchema, category: z.enum(['materials', 'tools', 'fuel', 'maintenance', 'other']), amountCents: integer.positive(), projectId: id.nullable(), createdAt: timestamp }).strict();
export const leadSchema = z.object({ id, name: nameSchema, phone: z.string().trim().max(100), email: emailSchema, workDescription: titleSchema, nextFollowUpDate: dateSchema.nullable(), followUps: z.array(z.object({ id, at: timestamp, note: noteSchema.refine(v => v.length > 0, 'Enter a follow-up note.') }).strict()) }).strict();
const baseSchema = z.object({
  schemaVersion: z.literal(1), timezone: z.literal('America/New_York'), currency: z.literal('USD'), seededOn: dateSchema,
  projects: z.array(z.object({ id, name: titleSchema, clientName: nameSchema, status: z.enum(['open', 'completed']) }).strict()),
  tasks: z.array(taskSchema), objectives: z.array(objectiveSchema), schedule: z.array(scheduleSchema), timeEntries: z.array(timeEntrySchema),
  runningTimer: z.object({ sessionId: id, taskId: id, startedAt: timestamp }).strict().nullable(),
  expenses: z.array(expenseSchema),
  materials: z.array(z.object({ id, name: titleSchema, product: z.string().trim().max(160), color: z.string().trim().max(160), finish: z.string().trim().max(160), unit: z.enum(['gal', 'piece']), stockMinor: integer }).strict()),
  materialRequirements: z.array(z.object({ id, materialId: id, projectId: id, neededMinor: integer, reservedMinor: integer }).strict()),
  materialAdjustments: z.array(z.object({ id, materialId: id, deltaMinor: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).refine(v => v !== 0), reason: z.enum(['restock', 'usage', 'correction']), note: noteSchema, createdAt: timestamp }).strict()),
  maintenance: z.array(z.object({ id, equipmentName: titleSchema, title: titleSchema, dueDate: dateSchema, completedAt: timestamp.nullable() }).strict()),
  leads: z.array(leadSchema),
}).strict();
export const appStateSchema = baseSchema.superRefine((s, ctx) => {
  const error = (message: string) => ctx.addIssue({ code: 'custom', message });
  const projects = new Set(s.projects.map(p => p.id)), tasks = new Set(s.tasks.map(t => t.id)), materials = new Map(s.materials.map(m => [m.id, m]));
  for (const records of [s.projects, s.tasks, s.objectives, s.schedule, s.timeEntries, s.expenses, s.materials, s.materialRequirements, s.materialAdjustments, s.maintenance, s.leads, ...s.leads.map(l => l.followUps)]) {
    if (new Set(records.map(r => r.id)).size !== records.length) error('Record IDs must be unique.');
  }
  for (const record of [...s.tasks, ...s.expenses]) if (record.projectId !== null && !projects.has(record.projectId)) error('Unknown project.');
  for (const record of [...s.objectives, ...s.schedule, ...s.timeEntries]) if (record.taskId !== null && !tasks.has(record.taskId)) error('Unknown task.');
  const objectiveDates = new Map<string, number>();
  for (const o of s.objectives) objectiveDates.set(o.date, (objectiveDates.get(o.date) ?? 0) + 1);
  if ([...objectiveDates.values()].some(count => count > 3)) error('Choose at most three objectives per date.');
  const scheduledTasks = s.schedule.flatMap(b => b.taskId ? [b.taskId] : []);
  if (new Set(scheduledTasks).size !== scheduledTasks.length) error('A task can have only one scheduled block.');
  for (const m of s.materials) {
    const reserved = s.materialRequirements.filter(r => r.materialId === m.id).reduce((sum, r) => sum + r.reservedMinor, 0);
    if (reserved > m.stockMinor) error('Stock cannot fall below existing reservations.');
    if (m.unit === 'piece' && m.stockMinor % 100 !== 0) error('Pieces require whole units.');
  }
  for (const r of s.materialRequirements) {
    const material = materials.get(r.materialId);
    if (!material || !projects.has(r.projectId)) error('Unknown material or project in requirement.');
    if (r.reservedMinor > r.neededMinor) error('Reservation cannot exceed need.');
    if (material?.unit === 'piece' && (r.neededMinor % 100 !== 0 || r.reservedMinor % 100 !== 0)) error('Pieces require whole units.');
  }
  for (const a of s.materialAdjustments) {
    const material = materials.get(a.materialId);
    if (!material) error('Unknown material.');
    if (material?.unit === 'piece' && a.deltaMinor % 100 !== 0) error('Pieces require whole units.');
  }
  if (s.runningTimer) {
    if (s.tasks.find(t => t.id === s.runningTimer?.taskId)?.status !== 'open') error('Only open tasks may have an active timer.');
    if (s.timeEntries.some(e => e.id === s.runningTimer?.sessionId)) error('A session cannot be both running and completed.');
  }
});
export function validateState(value: unknown): AppState { return appStateSchema.parse(value); }

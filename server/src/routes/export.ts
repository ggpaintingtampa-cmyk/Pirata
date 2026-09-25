// Chunk B: CSV exports (Excel-compatible UTF-8 with BOM, CRLF, attachment disposition).
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { can, isOfficeRole, laborCostCents, rateFor, shiftCostCents, type Role } from '@pirata/contracts/index';
import { businessDate, isLocalDate } from '@pirata/domain/lib/dates';
import type { Sqlite } from '../db/database.js';
import { Repositories } from '../core/repositories.js';
import { requireSession } from '../auth/sessions.js';
const dateSchema = z.string().refine(isLocalDate, 'Enter a valid calendar date.');
const cell = (value: unknown) => { const text = value === null || value === undefined ? '' : String(value); return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
export function csv(rows: readonly (readonly unknown[])[]): string { return '﻿' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'; }
const clock = (minute: number | null) => minute === null ? '' : String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
const dollars = (cents: number) => (cents / 100).toFixed(2);
function send(reply: FastifyReply, filename: string, body: string) { return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${filename}"`).send(body); }
export function registerExports(app: FastifyInstance, { db, now }: { db: Sqlite; now: () => number }): void {
  // GET /api/v1/export/shifts.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=&projectId=
  app.get('/api/v1/export/shifts.csv', async (req, reply) => {
    const s = requireSession(db, req, now()), role = s.role as Role;
    const q = z.object({ from: dateSchema.optional(), to: dateSchema.optional(), userId: z.string().max(100).optional(), projectId: z.string().max(100).optional() }).parse(req.query ?? {});
    const r = new Repositories(db, s.owner_id, () => true, s.user_id), team = r.team(), projects = r.list('projects'), money = can(role, 'money.costs'), rates = money ? r.list('pay_rates') : [];
    const shifts = r.list('work_shifts').filter(shift => (isOfficeRole(role) || shift.userId === s.user_id) && (!q.from || shift.date >= q.from) && (!q.to || shift.date <= q.to) && (!q.userId || shift.userId === q.userId) && (!q.projectId || shift.projectId === q.projectId)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const name = (id: string | null) => team.find(member => member.id === id)?.name ?? '';
    const header = ['date', 'person', 'project', 'kind', 'in', 'out', 'break_minutes', 'days', 'minutes', 'hours', 'status', 'note', 'approved_by', ...(money ? ['rate_kind', 'rate', 'cost'] : [])];
    const rows = shifts.map(shift => { const rate = money ? rateFor(rates, shift.userId, shift.date) : undefined; return [shift.date, name(shift.userId), projects.find(p => p.id === shift.projectId)?.name ?? '', shift.kind, clock(shift.startMinute), clock(shift.endMinute), shift.breakMinutes, shift.daysMinor === null ? '' : shift.daysMinor / 100, shift.minutes, (shift.minutes / 60).toFixed(2), shift.status, shift.note, name(shift.approvedBy), ...(money ? [rate?.kind ?? '', rate ? dollars(rate.amountCents) : '', dollars(shift.status === 'approved' ? shiftCostCents(shift, rate) : 0)] : [])]; });
    return send(reply, `pirata-hours-${q.from ?? 'all'}-${q.to ?? 'all'}.csv`, csv([header, ...rows]));
  });
  // GET /api/v1/export/daily-report.csv?date=YYYY-MM-DD — one row per report line
  app.get('/api/v1/export/daily-report.csv', async (req, reply) => {
    const s = requireSession(db, req, now()), role = s.role as Role;
    const { date } = z.object({ date: dateSchema.default(businessDate(now())) }).parse(req.query ?? {});
    const r = new Repositories(db, s.owner_id, () => true, s.user_id), team = r.team(), projects = r.list('projects'), tasks = r.list('tasks'), money = can(role, 'money.costs');
    const name = (id: string | null | undefined) => team.find(member => member.id === id)?.name ?? '';
    const project = (id: string | null | undefined) => projects.find(p => p.id === id)?.name ?? '';
    const rows: unknown[][] = [['section', 'project', 'person', 'text', 'minutes', 'status', 'amount']];
    for (const task of tasks.filter(t => t.completedAt && businessDate(t.completedAt) === date).sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))) rows.push(['task_completed', project(task.projectId), name(task.completedBy), task.title, '', task.parentTaskId ? 'step' : 'task', '']);
    const shifts = r.list('work_shifts').filter(shift => shift.date === date && (isOfficeRole(role) || shift.userId === s.user_id));
    for (const shift of shifts) rows.push(['hours', project(shift.projectId), name(shift.userId), shift.kind === 'hours' ? clock(shift.startMinute) + '-' + clock(shift.endMinute) : (shift.daysMinor ?? 0) / 100 + ' day', shift.minutes, shift.status, '']);
    for (const note of r.list('day_notes').filter(n => n.date === date)) rows.push(['end_of_day_note', '', name(note.userId), note.body, '', '', '']);
    for (const question of r.list('task_questions').filter(q => businessDate(q.createdAt) === date)) rows.push(['question', project(question.projectId), name(question.askedBy), question.body + (question.answer ? ' — ' + question.answer : ''), '', question.answeredAt ? 'answered' : 'open', '']);
    for (const item of r.list('shopping_items').filter(i => businessDate(i.createdAt) === date && !i.archivedAt)) rows.push(['material_request', project(item.projectId), name(item.createdBy), item.title + (item.quantity ? ' × ' + item.quantity : ''), '', item.receivedAt ? 'received' : 'requested', '']);
    for (const out of r.list('tool_sign_outs').filter(o => businessDate(o.takenAt) === date || (o.returnedAt && businessDate(o.returnedAt) === date))) rows.push(['tool', project(out.projectId), name(out.takenBy), r.get('equipment', out.equipmentId)?.name ?? '', '', out.returnedAt && businessDate(out.returnedAt) === date ? 'returned' : 'taken', '']);
    for (const report of r.list('equipment_reports').filter(rep => businessDate(rep.createdAt) === date)) rows.push(['broken', '', name(report.reportedBy), (r.get('equipment', report.equipmentId)?.name ?? '') + ': ' + report.body, '', report.resolvedAt ? 'resolved' : 'open', '']);
    if (money) {
      for (const expense of r.list('expenses').filter(e => e.purchaseDate === date)) rows.push(['expense', project(expense.projectId), '', expense.description, '', expense.category, dollars(expense.amountCents)]);
      const rates = r.list('pay_rates');
      for (const p of projects) { const cost = laborCostCents(shifts, rates, { projectId: p.id, from: date, to: date }); if (cost) rows.push(['labor_cost', p.name, '', '', shifts.filter(sh => sh.projectId === p.id && sh.status === 'approved').reduce((sum, sh) => sum + sh.minutes, 0), 'approved', dollars(cost)]); }
    }
    return send(reply, `pirata-daily-report-${date}.csv`, csv(rows));
  });
}

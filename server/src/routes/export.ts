// Chunk B: CSV exports (Excel-compatible UTF-8 with BOM, CRLF, attachment disposition).
// Update 2026-09-29 (P13): `locale` localizes the free-text columns from the translation cache (translating on demand within
// the owner's allowance, bounded to 200 fields); originals and a translation_status column travel beside them. Column names stay canonical.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { can, isOfficeRole, laborCostCents, rateFor, shiftCostCents, type Role } from '@pirata/contracts/index';
import { localeSchema, type Locale, type TranslationItem, type TranslationResult } from '@pirata/contracts/translation';
import { businessDate, isLocalDate } from '@pirata/domain/lib/dates';
import type { Sqlite } from '../db/database.js';
import { Repositories } from '../core/repositories.js';
import { readSnapshot } from '../core/snapshot.js';
import { capabilities } from '../modules/index.js';
import { requireSession } from '../auth/sessions.js';
import type { TranslationService } from '../translation/service.js';
const dateSchema = z.string().refine(isLocalDate, 'Enter a valid calendar date.');
const cell = (value: unknown) => { const text = value === null || value === undefined ? '' : String(value); return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
export function csv(rows: readonly (readonly unknown[])[]): string { return '﻿' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'; }
const clock = (minute: number | null) => minute === null ? '' : String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
const dollars = (cents: number) => (cents / 100).toFixed(2);
function send(reply: FastifyReply, filename: string, body: string) { return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${filename}"`).send(body); }
export const EXPORT_TRANSLATION_LIMIT = 200;
type Session = { owner_id: string; user_id: string; role: Role };
/** Viewer-language text for export rows: the cached or freshly made translation, else the original with status `original`. */
class Localizer {
  readonly #results = new Map<string, TranslationResult>();
  constructor(readonly locale: Locale | undefined) {}
  static async build(db: Sqlite, now: () => number, translation: TranslationService | undefined, s: Session, locale: Locale | undefined, items: TranslationItem[]): Promise<Localizer> {
    const localizer = new Localizer(locale);
    if (!locale || !translation || !items.length) return localizer;
    const snapshot = readSnapshot(db, s.owner_id, capabilities, now(), s.user_id, s.role);
    const wanted = items.slice(0, EXPORT_TRANSLATION_LIMIT);
    for (let i = 0; i < wanted.length; i += 40) for (const r of await translation.translate(s.owner_id, s.user_id, snapshot, locale, wanted.slice(i, i + 40))) localizer.#results.set(`${r.kind}|${r.id}|${r.field}`, r);
    return localizer;
  }
  text(kind: TranslationItem['kind'], id: string, field: string, original: string): { text: string; status: 'original' | 'translated' | 'corrected' | 'same' } {
    const r = this.#results.get(`${kind}|${id}|${field}`);
    if (!r || !this.locale) return { text: original, status: 'original' };
    if (r.status === 'corrected') return { text: r.text ?? original, status: 'corrected' };
    if (r.status === 'ready' || r.status === 'unsure') return { text: r.text ?? original, status: 'translated' };
    if (r.status === 'same') return { text: original, status: 'same' };
    return { text: original, status: 'original' };
  }
  columns(kind: TranslationItem['kind'], id: string, field: string, original: string): unknown[] {
    if (!this.locale) return [original];
    const { text, status } = this.text(kind, id, field, original);
    return [text, text === original ? '' : original, status];
  }
  headers(name: string): string[] { return this.locale ? [name, name + '_original', 'translation_status'] : [name]; }
}
export function registerExports(app: FastifyInstance, { db, now, translation }: { db: Sqlite; now: () => number; translation?: TranslationService }): void {
  // GET /api/v1/export/shifts.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=&projectId=&locale=
  app.get('/api/v1/export/shifts.csv', async (req, reply) => {
    const s = requireSession(db, req, now()), role = s.role as Role;
    const q = z.object({ from: dateSchema.optional(), to: dateSchema.optional(), userId: z.string().max(100).optional(), projectId: z.string().max(100).optional(), locale: localeSchema.optional() }).parse(req.query ?? {});
    const r = new Repositories(db, s.owner_id, () => true, s.user_id), team = r.team(), projects = r.list('projects'), money = can(role, 'money.costs'), rates = money ? r.list('pay_rates') : [];
    const shifts = r.list('work_shifts').filter(shift => (isOfficeRole(role) || shift.userId === s.user_id) && (!q.from || shift.date >= q.from) && (!q.to || shift.date <= q.to) && (!q.userId || shift.userId === q.userId) && (!q.projectId || shift.projectId === q.projectId)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const localizer = await Localizer.build(db, now, translation, s, q.locale, shifts.filter(shift => shift.note.trim()).map(shift => ({ kind: 'shift' as const, id: shift.id, field: 'note' })));
    const name = (id: string | null) => team.find(member => member.id === id)?.name ?? '';
    const header = ['date', 'person', 'project', 'kind', 'in', 'out', 'break_minutes', 'days', 'minutes', 'hours', 'status', ...localizer.headers('note'), 'approved_by', ...(money ? ['rate_kind', 'rate', 'cost'] : [])];
    const rows = shifts.map(shift => { const rate = money ? rateFor(rates, shift.userId, shift.date) : undefined; return [shift.date, name(shift.userId), projects.find(p => p.id === shift.projectId)?.name ?? '', shift.kind, clock(shift.startMinute), clock(shift.endMinute), shift.breakMinutes, shift.daysMinor === null ? '' : shift.daysMinor / 100, shift.minutes, (shift.minutes / 60).toFixed(2), shift.status, ...localizer.columns('shift', shift.id, 'note', shift.note), name(shift.approvedBy), ...(money ? [rate?.kind ?? '', rate ? dollars(rate.amountCents) : '', dollars(shift.status === 'approved' ? shiftCostCents(shift, rate) : 0)] : [])]; });
    return send(reply, `pirata-hours-${q.from ?? 'all'}-${q.to ?? 'all'}.csv`, csv([header, ...rows]));
  });
  // GET /api/v1/export/daily-report.csv?date=YYYY-MM-DD&locale= — one row per report line
  app.get('/api/v1/export/daily-report.csv', async (req, reply) => {
    const s = requireSession(db, req, now()), role = s.role as Role;
    const { date, locale } = z.object({ date: dateSchema.default(businessDate(now())), locale: localeSchema.optional() }).parse(req.query ?? {});
    const r = new Repositories(db, s.owner_id, () => true, s.user_id), team = r.team(), projects = r.list('projects'), tasks = r.list('tasks'), money = can(role, 'money.costs');
    const name = (id: string | null | undefined) => team.find(member => member.id === id)?.name ?? '';
    const project = (id: string | null | undefined) => projects.find(p => p.id === id)?.name ?? '';
    const completed = tasks.filter(t => t.completedAt && businessDate(t.completedAt) === date).sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
    const shifts = r.list('work_shifts').filter(shift => shift.date === date && (isOfficeRole(role) || shift.userId === s.user_id));
    const notes = r.list('day_notes').filter(n => n.date === date), questions = r.list('task_questions').filter(q => businessDate(q.createdAt) === date);
    const requests = r.list('shopping_items').filter(i => businessDate(i.createdAt) === date && !i.archivedAt), outs = r.list('tool_sign_outs').filter(o => businessDate(o.takenAt) === date || (o.returnedAt && businessDate(o.returnedAt) === date));
    const reports = r.list('equipment_reports').filter(rep => businessDate(rep.createdAt) === date), expenses = money ? r.list('expenses').filter(e => e.purchaseDate === date) : [];
    const items: TranslationItem[] = [
      ...completed.map(t => ({ kind: 'task' as const, id: t.id, field: 'title' })), ...shifts.filter(sh => sh.note.trim()).map(sh => ({ kind: 'shift' as const, id: sh.id, field: 'note' })),
      ...notes.map(n => ({ kind: 'dayNote' as const, id: n.id, field: 'body' })), ...questions.map(qn => ({ kind: 'question' as const, id: qn.id, field: 'body' })), ...questions.filter(qn => qn.answer).map(qn => ({ kind: 'question' as const, id: qn.id, field: 'answer' })),
      ...requests.map(i => ({ kind: 'materialRequest' as const, id: i.id, field: 'title' })), ...reports.map(rep => ({ kind: 'equipmentReport' as const, id: rep.id, field: 'body' })), ...expenses.map(e => ({ kind: 'expense' as const, id: e.id, field: 'description' })),
    ];
    const localizer = await Localizer.build(db, now, translation, s, locale, items);
    const rows: unknown[][] = [['section', 'project', 'person', ...localizer.headers('text'), 'minutes', 'status', 'amount']];
    for (const task of completed) rows.push(['task_completed', project(task.projectId), name(task.completedBy), ...localizer.columns('task', task.id, 'title', task.title), '', task.parentTaskId ? 'step' : 'task', '']);
    for (const shift of shifts) rows.push(['hours', project(shift.projectId), name(shift.userId), ...localizer.columns('shift', shift.id, 'note', (shift.kind === 'hours' ? clock(shift.startMinute) + '-' + clock(shift.endMinute) : (shift.daysMinor ?? 0) / 100 + ' day') + (shift.note ? ' · ' + localizer.text('shift', shift.id, 'note', shift.note).text : '')), shift.minutes, shift.status, '']);
    for (const note of notes) rows.push(['end_of_day_note', '', name(note.userId), ...localizer.columns('dayNote', note.id, 'body', note.body), '', '', '']);
    for (const question of questions) { const body = localizer.text('question', question.id, 'body', question.body).text, answer = question.answer ? localizer.text('question', question.id, 'answer', question.answer).text : ''; rows.push(['question', project(question.projectId), name(question.askedBy), ...(locale ? [body + (answer ? ' — ' + answer : ''), question.body + (question.answer ? ' — ' + question.answer : ''), localizer.text('question', question.id, 'body', question.body).status] : [question.body + (question.answer ? ' — ' + question.answer : '')]), '', question.answeredAt ? 'answered' : 'open', '']); }
    for (const item of requests) rows.push(['material_request', project(item.projectId), name(item.createdBy), ...localizer.columns('materialRequest', item.id, 'title', item.title + (item.quantity ? ' × ' + item.quantity : '')), '', item.receivedAt ? 'received' : 'requested', '']);
    for (const out of outs) rows.push(['tool', project(out.projectId), name(out.takenBy), ...(locale ? [r.get('equipment', out.equipmentId)?.name ?? '', '', 'same'] : [r.get('equipment', out.equipmentId)?.name ?? '']), '', out.returnedAt && businessDate(out.returnedAt) === date ? 'returned' : 'taken', '']);
    for (const report of reports) rows.push(['broken', '', name(report.reportedBy), ...localizer.columns('equipmentReport', report.id, 'body', (r.get('equipment', report.equipmentId)?.name ?? '') + ': ' + report.body), '', report.resolvedAt ? 'resolved' : 'open', '']);
    if (money) {
      for (const expense of expenses) rows.push(['expense', project(expense.projectId), '', ...localizer.columns('expense', expense.id, 'description', expense.description), '', expense.category, dollars(expense.amountCents)]);
      const rates = r.list('pay_rates');
      for (const p of projects) { const cost = laborCostCents(shifts, rates, { projectId: p.id, from: date, to: date }); if (cost) rows.push(['labor_cost', p.name, '', ...(locale ? ['', '', 'same'] : ['']), shifts.filter(sh => sh.projectId === p.id && sh.status === 'approved').reduce((sum, sh) => sum + sh.minutes, 0), 'approved', dollars(cost)]); }
    }
    return send(reply, `pirata-daily-report-${date}.csv`, csv(rows));
  });
}

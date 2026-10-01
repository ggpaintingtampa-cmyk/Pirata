// P13: the registry of translatable text. Every reader works on the role-filtered snapshot, so a person can only
// address text the snapshot would already show them. Literal values (names, addresses, codes, amounts) are never listed.
import type { BusinessSnapshot, TemplateNode, TranslatableKind } from '@pirata/contracts/index';
import { TRANSLATABLE_KINDS } from '@pirata/contracts/translation';

export type Fields = Record<string, string>;
type Reader = (s: BusinessSnapshot, id: string) => Fields | undefined;
type Lister = (s: BusinessSnapshot) => string[];
const text = (v: unknown) => typeof v === 'string' ? v : '';
function pick<T extends object>(row: T | undefined, fields: (keyof T)[]): Fields | undefined {
  if (!row) return undefined;
  return Object.fromEntries(fields.map(f => [String(f), text(row[f])]));
}
function parseTree(raw: string | null | undefined): TemplateNode[] { try { return raw ? JSON.parse(raw) as TemplateNode[] : []; } catch { return []; } }
/** Template trees are addressed by path: `tree.0.2.title`, `tree.0.requirements.1.name`. */
function treeFields(nodes: readonly TemplateNode[], prefix = 'tree'): Fields {
  const out: Fields = {};
  nodes.forEach((node, index) => {
    const base = `${prefix}.${index}`;
    out[`${base}.title`] = node.title; out[`${base}.description`] = node.description ?? '';
    (node.requirements ?? []).forEach((req, r) => { out[`${base}.requirements.${r}.name`] = req.name; out[`${base}.requirements.${r}.note`] = req.note; });
    Object.assign(out, treeFields(node.children ?? [], base));
  });
  return out;
}
const ids = (rows: readonly { id: string }[] | undefined) => (rows ?? []).map(r => r.id);

const READERS: Record<TranslatableKind, Reader> = {
  task: (s, id) => pick(s.tasks.find(t => t.id === id), ['title', 'description', 'note']),
  project: (s, id) => pick(s.projects.find(p => p.id === id), ['name', 'note', 'salesNote', 'reviewNote']),
  question: (s, id) => pick((s.taskQuestions ?? []).find(q => q.id === id), ['body', 'answer']),
  projectNote: (s, id) => pick((s.projectNotes ?? []).find(n => n.id === id), ['title', 'body']),
  taskTemplate: (s, id) => { const t = (s.taskTemplates ?? []).find(x => x.id === id); return t ? { name: t.name, ...treeFields(parseTree(t.tree)) } : undefined; },
  projectTemplate: (s, id) => { const t = (s.projectTemplates ?? []).find(x => x.id === id); return t ? { name: t.name, note: t.note, ...treeFields(parseTree(t.tree)) } : undefined; },
  materialRequest: (s, id) => pick((s.shoppingItems ?? []).find(i => i.id === id), ['title', 'note']),
  dayNote: (s, id) => pick((s.dayNotes ?? []).find(n => n.id === id), ['body']),
  message: (s, id) => { const a = (s.activity ?? []).find(x => x.id === id && x.kind === 'message'); return pick(a, ['body']); },
  attachmentComment: (s, id) => pick((s.attachmentComments ?? []).find(c => c.id === id), ['body']),
  equipmentReport: (s, id) => pick((s.equipmentReports ?? []).find(r => r.id === id), ['body']),
  shift: (s, id) => pick((s.workShifts ?? []).find(w => w.id === id), ['note', 'decisionNote']),
  objective: (s, id) => pick(s.objectives.find(o => o.id === id), ['title', 'note']),
  timeEntry: (s, id) => pick(s.timeEntries.find(e => e.id === id), ['note']),
  toolSignOut: (s, id) => pick((s.toolSignOuts ?? []).find(o => o.id === id), ['note']),
  scheduleBlock: (s, id) => { const b = s.schedule.find(x => x.id === id && x.kind !== 'task'); return pick(b, ['title']); },
  expense: (s, id) => pick(s.expenses.find(e => e.id === id), ['description']),
  maintenance: (s, id) => pick(s.maintenance.find(m => m.id === id), ['title']),
  equipment: (s, id) => pick(s.equipment.find(e => e.id === id), ['note']),
  projectFact: (s, id) => { const f = (s.projectFacts ?? []).find(x => x.id === id && x.key === 'custom'); return pick(f, ['label']); },
  taskRequirement: (s, id) => pick((s.taskRequirements ?? []).find(r => r.id === id), ['name', 'note']),
  client: (s, id) => pick(s.clients.find(c => c.id === id), ['note']),
  lead: (s, id) => pick(s.leads.find(l => l.id === id), ['workDescription']),
  leadFollowUp: (s, id) => { for (const lead of s.leads) { const f = lead.followUps.find(x => x.id === id); if (f) return pick(f, ['note']); } return undefined; },
};
const LISTERS: Record<TranslatableKind, Lister> = {
  task: s => ids(s.tasks), project: s => ids(s.projects), question: s => ids(s.taskQuestions), projectNote: s => ids(s.projectNotes),
  taskTemplate: s => ids(s.taskTemplates), projectTemplate: s => ids(s.projectTemplates), materialRequest: s => ids(s.shoppingItems), dayNote: s => ids(s.dayNotes),
  message: s => (s.activity ?? []).filter(a => a.kind === 'message').map(a => a.id), attachmentComment: s => ids(s.attachmentComments), equipmentReport: s => ids(s.equipmentReports),
  shift: s => ids(s.workShifts), objective: s => ids(s.objectives), timeEntry: s => ids(s.timeEntries), toolSignOut: s => ids(s.toolSignOuts),
  scheduleBlock: s => s.schedule.filter(b => b.kind !== 'task').map(b => b.id), expense: s => ids(s.expenses), maintenance: s => ids(s.maintenance), equipment: s => ids(s.equipment),
  projectFact: s => (s.projectFacts ?? []).filter(f => f.key === 'custom').map(f => f.id), taskRequirement: s => ids(s.taskRequirements), client: s => ids(s.clients), lead: s => ids(s.leads),
  leadFollowUp: s => s.leads.flatMap(l => l.followUps.map(f => f.id)),
};
/** Every translatable field of one record, or undefined when the record is not visible to this snapshot. */
export function readFields(snapshot: BusinessSnapshot, kind: TranslatableKind, id: string): Fields | undefined { return READERS[kind](snapshot, id); }
export function readField(snapshot: BusinessSnapshot, kind: TranslatableKind, id: string, field: string): string | undefined {
  const fields = READERS[kind](snapshot, id);
  return fields && Object.hasOwn(fields, field) ? fields[field] : undefined;
}
/** Every (kind, id) visible in the snapshot, in a fixed order, for search and backfill. */
export function listRecords(snapshot: BusinessSnapshot): { kind: TranslatableKind; id: string }[] {
  return TRANSLATABLE_KINDS.flatMap(kind => LISTERS[kind](snapshot).map(id => ({ kind, id })));
}
/** A display title for search results: the record's first non-empty field or its kind. */
export function recordTitle(snapshot: BusinessSnapshot, kind: TranslatableKind, id: string): string {
  const fields = READERS[kind](snapshot, id) ?? {};
  if (kind === 'question') { const task = snapshot.tasks.find(t => t.id === (snapshot.taskQuestions ?? []).find(q => q.id === id)?.taskId); if (task) return task.title; }
  return Object.values(fields).find(value => value.trim()) ?? kind;
}
export function recordProject(snapshot: BusinessSnapshot, kind: TranslatableKind, id: string): string | null {
  const find = <T extends { id: string }>(rows: readonly T[] | undefined) => (rows ?? []).find(r => r.id === id) as (T & { projectId?: string | null }) | undefined;
  switch (kind) {
    case 'project': return id;
    case 'task': return find(snapshot.tasks)?.projectId ?? null;
    case 'question': return find(snapshot.taskQuestions)?.projectId ?? null;
    case 'projectNote': return find(snapshot.projectNotes)?.projectId ?? null;
    case 'materialRequest': return find(snapshot.shoppingItems)?.projectId ?? null;
    case 'message': return find(snapshot.activity)?.projectId ?? null;
    case 'shift': return find(snapshot.workShifts)?.projectId ?? null;
    case 'expense': return find(snapshot.expenses)?.projectId ?? null;
    case 'projectFact': return find(snapshot.projectFacts)?.projectId ?? null;
    case 'taskRequirement': { const r = find(snapshot.taskRequirements); return snapshot.tasks.find(t => t.id === r?.taskId)?.projectId ?? null; }
    default: return null;
  }
}

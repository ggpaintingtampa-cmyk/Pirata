import { useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Users } from 'lucide-react';
import { dayCompletion, dayItems, presence, subtree, taskDepth, type BusinessCommand, type DayAssignment, type DayScope, type Task } from '@pirata/contracts/index';
import { projectCompletion, completionPercent } from '@pirata/contracts/progress';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, useLocale } from '../../i18n';
import { formatClockMinute, formatDateTime } from '../../i18n/locale';
import { TranslatedText } from '../../components/TranslatedText';
import { useConfirm } from '../../components/ConfirmDialog';
import { useCan } from '../../state/permissions';
import { DateField, addDays } from '../../components/DateField';
import { ThumbStrip } from '../../components/ThumbStrip';
import { CompletionRing } from '../tasks-time/CompletionRing';
import { useServerNow } from '../tasks-time/useServerNow';
import { PlanEditor } from './PlanEditor';
import { QuestionDialog } from './QuestionDialog';
import { WhoWorked } from './WhoWorked';
import { RequirementChips } from '../templates/RequirementsEditor';
import { ScheduleTaskDialog } from '../planning';
import { useRetryableCommand } from './commands';
import { affectedSession, canEditDone, flattenGroups, groupByProject, groupByTimeThenProject, parseScope, scopeKey, treeCompletion, type DayGroupMode } from './dayList';
import './styles.css';


/** One node's done toggle: completes the subtree (with confirmation) or reopens within the rules. */
function NodeCheck({ app, task, now, label }: { app: ModuleProps; task: Task; now: number; label: string }) {
  const t = useT(), [busy, setBusy] = useState(false), [error, setError] = useState(''), { confirm, dialog } = useConfirm(), runner = useRetryableCommand(app);
  const me = app.snapshot.currentUser?.id, role = app.snapshot.currentUser?.role;
  const done = task.status === 'done', editable = canEditDone(task, me, role, now), nodes = subtree(app.snapshot.tasks, task.id);
  const toggle = async () => {
    if (busy) return;
    if (done && !editable) { setError(t('work.locked')); return; }
    const hasOpenChildren = nodes.slice(1).some(node => node.status !== 'done');
    if (done ? !await confirm({ title: t('work.open'), message: t('work.undoConfirm', { title: task.title }) }) : hasOpenChildren && !await confirm({ title: t('work.done'), message: t('work.completeConfirm', { title: task.title }) })) return;
    setBusy(true); setError((await runner.run({ type: 'task.setStatus', id: task.id, status: done ? 'open' : 'done', expectedSessionId: done ? null : affectedSession(app.snapshot, task.id) })) ?? ''); setBusy(false);
  };
  const retry = async () => { setBusy(true); setError((await runner.retry()) ?? ''); setBusy(false); };
  return <span className="day-check-wrap"><button type="button" className={'day-check' + (done ? ' is-done' : '') + (done && !editable ? ' is-locked' : '')} aria-pressed={done} aria-label={label} disabled={busy} title={done && !editable ? t('work.locked') : undefined} onClick={() => void toggle()}>{done && <Check size={14} aria-hidden="true" />}</button>{error && <span role="alert" className="work-error">{error}{runner.pending && <button type="button" className="work-link-button" disabled={busy} onClick={() => void retry()}>{t('shell.command.retryAction')}</button>}</span>}{dialog}</span>;
}

export interface MaterialRequestInput { title: string; quantity: string; projectId?: string; taskId: string }
function DayCard({ app, row, task, now, number, onAsk, onSetTime, onRequestMaterial }: { app: ModuleProps; row: DayAssignment; task: Task; now: number; number: number; onAsk(taskId: string): void; onSetTime(taskId: string): void; onRequestMaterial?(input: MaterialRequestInput): void }) {
  const t = useT(), locale = useLocale(), [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), runner = useRetryableCommand(app), canOthers = useCan('plan.others');
  const snapshot = app.snapshot, me = snapshot.currentUser?.id, tasks = snapshot.tasks;
  const nodes = subtree(tasks, task.id), children = nodes.slice(1), completion = treeCompletion(tasks, task.id);
  const assignee = snapshot.team?.find(member => member.id === task.assigneeId), completer = snapshot.team?.find(member => member.id === task.completedBy);
  const pinned = (snapshot.projectNotes ?? []).filter(note => note.projectId === task.projectId && note.pinned);
  const attachments = (snapshot.attachments ?? []).filter(file => file.parentType === 'task' && nodes.some(node => node.id === file.parentId));
  const bring = (snapshot.taskRequirements ?? []).filter(r => nodes.some(node => node.id === r.taskId));
  const run = async (command: BusinessCommand) => { setBusy(true); setError((await runner.run(command)) ?? ''); setBusy(false); };
  const retry = async () => { setBusy(true); setError((await runner.retry()) ?? ''); setBusy(false); };
  const status = task.status === 'done' ? t('work.done') : task.status === 'blocked' ? t('work.blocked') : t('work.open');
  return <article className={'day-card' + (task.status === 'done' ? ' is-done' : '')} data-testid="day-card" aria-label={number + '. ' + task.title}>
    <div className="day-card-head">
      <span className="day-number" aria-hidden="true">{number}.</span>
      <NodeCheck app={app} task={task} now={now} label={task.title} />
      <div className="day-card-title"><button type="button" className="day-card-open" onClick={() => app.onOpenTask(task.id)}><strong><TranslatedText kind="task" id={task.id} field="title" text={task.title} compact /></strong></button>{task.description && <TranslatedText kind="task" id={task.id} field="description" text={task.description} as="p" className="day-card-description" compact />}
        <div className="day-card-meta"><span className={'badge badge-' + task.status}>{status}</span><span className="day-chip">{assignee?.name ?? t('work.unassigned')}</span>{completion.total > 1 && <span className="day-chip">{t('work.steps', { done: completion.done, total: completion.total })}</span>}{row.userId === null && <span className="day-chip day-chip-pool">{t('work.pool')}</span>}</div></div>
      <button type="button" className="day-card-expand" aria-expanded={expanded} aria-label={expanded ? t('work.hide') : t('work.details')} onClick={() => setExpanded(open => !open)}>{expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}</button>
    </div>
    {children.length > 0 && <ul className="day-tree">{children.map(child => <li key={child.id} className={'day-tree-node depth-' + taskDepth(tasks, child.id) + (child.status === 'done' ? ' is-done' : '')}><NodeCheck app={app} task={child} now={now} label={child.title} /><span className="day-tree-text"><TranslatedText kind="task" id={child.id} field="title" text={child.title} compact />{child.description && <small><TranslatedText kind="task" id={child.id} field="description" text={child.description} compact /></small>}</span></li>)}</ul>}
    {expanded && <div className="day-card-details">
      {task.note && <TranslatedText kind="task" id={task.id} field="note" text={task.note} as="p" className="day-note" />}
      {pinned.length > 0 && <div className="day-paint"><strong>{t('work.paint')}</strong>{pinned.map(note => <p key={note.id}><span><TranslatedText kind="projectNote" id={note.id} field="title" text={note.title} compact /></span> {[note.product, note.color, note.colorCode, note.finish, note.quantity].filter(Boolean).join(' · ')}</p>)}</div>}
      {bring.length > 0 && <div className="day-bring"><strong>{t('work.bring')}</strong><RequirementChips rows={bring} onRequest={onRequestMaterial ? requirement => onRequestMaterial({ title: requirement.name, quantity: [requirement.quantity, requirement.unit].filter(Boolean).join(' '), projectId: task.projectId ?? undefined, taskId: task.id }) : undefined} /></div>}
      <ThumbStrip attachments={attachments} />
      {task.completedAt && <p className="muted">{t('work.doneBy', { name: completer?.name ?? '—', time: formatDateTime(locale, task.completedAt) })}</p>}
      <div className="live-actions"><button type="button" onClick={() => app.onOpenTask(task.id)}>{t('work.openTask')}</button><button type="button" onClick={() => onAsk(task.id)}><Users size={15} aria-hidden="true" />{t('work.ask')}</button>{(row.userId === me || canOthers) && <button type="button" onClick={() => onSetTime(task.id)}><Clock3 size={15} aria-hidden="true" />{t('work.setTime')}</button>}
        {row.userId === null && <button type="button" className="work-primary" disabled={busy} onClick={() => void run({ type: 'dayList.take', id: row.id })}>{t('work.take')}</button>}
        {row.userId !== null && row.userId === me && <button type="button" disabled={busy} onClick={() => void run({ type: 'dayList.release', id: row.id })}>{t('work.release')}</button>}</div>
      {error && <p role="alert" className="work-error">{error}{runner.pending && <button type="button" className="work-link-button" disabled={busy} onClick={() => void retry()}>{t('shell.command.retryAction')}</button>}</p>}
    </div>}
  </article>;
}

/** P01: the grouping choice is remembered for the browser session only (memory, never storage). */
let rememberedMode: DayGroupMode = 'time';
export function WorkView(app: ModuleProps & { onOpenProjects?(): void; onOpenTasks?(): void; onOpenHours?(date: string): void; onRequestMaterial?(input: MaterialRequestInput): void }) {
  const t = useT(), locale = useLocale(), now = useServerNow(app.snapshot), canOthers = useCan('plan.others');
  const snapshot = app.snapshot, me = snapshot.currentUser?.id ?? '', tasks = snapshot.tasks;
  const [date, setDate] = useState(app.businessDate), [scopeId, setScopeId] = useState('person:' + me), [planning, setPlanning] = useState(false), [question, setQuestion] = useState<string | null>(null), [timing, setTiming] = useState<string | null>(null);
  const [mode, setModeState] = useState<DayGroupMode>(rememberedMode);
  const setMode = (next: DayGroupMode) => { rememberedMode = next; setModeState(next); };
  const scope: DayScope = parseScope(scopeId) ?? { kind: 'person', userId: me };
  const rows = dayItems(snapshot, date, scope), completion = dayCompletion(tasks, rows);
  const timeGroups = mode === 'time' ? groupByTimeThenProject(snapshot, rows, date) : null, projectGroups = mode === 'project' ? groupByProject(snapshot, rows) : null;
  const numbers = new Map(flattenGroups(timeGroups ?? projectGroups ?? []).map((row, index) => [row.id, index + 1] as const));
  const cards = (list: readonly DayAssignment[]) => list.map(row => { const task = tasks.find(item => item.id === row.taskId); return task ? <DayCard key={row.id} app={app} row={row} task={task} now={now} number={numbers.get(row.id) ?? 0} onAsk={setQuestion} onSetTime={setTiming} onRequestMaterial={app.onRequestMaterial} /> : null; });
  const projectHeading = (projectId: string, name: string) => <button type="button" onClick={() => app.onOpenProject(projectId)}>{name}<ChevronRight size={16} aria-hidden="true" /></button>;
  const people = (snapshot.team ?? []).filter(member => !member.disabledAt), projects = snapshot.projects.filter(project => project.status !== 'completed');
  const canPlan = scope.kind === 'project' || scope.userId === me || canOthers;
  const onSite = scope.kind === 'project' ? presence(snapshot, date, scope.projectId).map(id => people.find(member => member.id === id)?.name ?? '').filter(Boolean) : [];
  const leaves = rows.reduce((sum, row) => sum + (row.taskId ? treeCompletion(tasks, row.taskId).total : 0), 0), doneLeaves = rows.reduce((sum, row) => sum + (row.taskId ? treeCompletion(tasks, row.taskId).done : 0), 0);
  return <section className="work-home daily-page" aria-label={t('shell.view.work')}>
    <div className="day-header">
      <div className="day-date"><button type="button" aria-label={t('work.previousDay')} onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={18} aria-hidden="true" /></button><DateField label={t('work.date')} value={date} onChange={setDate} /><button type="button" aria-label={t('work.nextDay')} onClick={() => setDate(addDays(date, 1))}><ChevronRight size={18} aria-hidden="true" /></button>{date !== app.businessDate && <button type="button" className="work-link-button" onClick={() => setDate(app.businessDate)}>{t('work.today')}</button>}</div>
      <label className="work-field day-scope">{t('work.scope')}<select value={scopeKey(scope)} onChange={e => setScopeId(e.target.value)}>
        <optgroup label={t('work.people')}>{people.map(member => <option key={member.id} value={'person:' + member.id}>{member.id === me ? t('work.mine') + ' · ' : ''}{member.name}</option>)}</optgroup>
        <optgroup label={t('work.pools')}>{projects.map(project => <option key={project.id} value={'project:' + project.id}>{project.name}</option>)}</optgroup></select></label>
    </div>
    <div className="day-summary"><CompletionRing fraction={completion} label={t('work.steps', { done: doneLeaves, total: leaves })} size={56} /><div><strong>{t('work.steps', { done: doneLeaves, total: leaves })}</strong>{scope.kind === 'project' && <p className="muted">{onSite.length ? t('work.onSite', { names: onSite.join(', ') }) : t('work.nobodyPlanned')}</p>}</div>{canPlan && <button type="button" className="work-primary" onClick={() => setPlanning(true)}>{t('work.plan')}</button>}</div>
    <WhoWorked app={app} date={date} onOpenHours={app.onOpenHours} />
    {!rows.length && <div className="work-empty-state"><div><h3>{t('work.empty')}</h3><p>{t('work.emptyHint')}</p></div></div>}
    {rows.length > 0 && <div className="day-mode" role="group" aria-label={t('work.groupMode')}><button type="button" aria-pressed={mode === 'time'} onClick={() => setMode('time')}>{t('work.group.time')}</button><button type="button" aria-pressed={mode === 'project'} onClick={() => setMode('project')}>{t('work.group.project')}</button></div>}
    {timeGroups?.map(group => <section key={group.startMinute ?? 'unscheduled'} className="day-time-group" aria-label={group.startMinute === null ? t('work.group.unscheduled') : formatClockMinute(locale, group.startMinute)}><h3 className="day-time-title">{group.startMinute === null ? t('work.group.unscheduled') : formatClockMinute(locale, group.startMinute)}</h3>
      {group.projects.map(project => <div key={project.projectId} className="day-group"><h4 className="day-group-title">{projectHeading(project.projectId, project.name)}</h4>{cards(project.rows)}</div>)}</section>)}
    {projectGroups?.map(group => <section key={group.projectId} className="day-group"><h3 className="day-group-title">{projectHeading(group.projectId, group.name)}</h3>{cards(group.rows)}</section>)}
    <section className="day-projects"><div className="task-results-heading"><span>{t('work.projects')}</span><button type="button" className="work-link-button" onClick={() => app.onOpenProjects?.()}>{t('work.allProjects')}</button><button type="button" className="work-link-button" onClick={() => app.onOpenTasks?.()}>{t('work.allTasks')}</button></div>
      <ul className="day-project-list">{projects.slice(0, 4).map(project => { const fraction = projectCompletion(project.id, tasks); return <li key={project.id}><button type="button" onClick={() => app.onOpenProject(project.id)}><span>{project.name}</span><small>{fraction === null ? '—' : completionPercent(fraction) + '%'}</small></button></li>; })}</ul></section>
    {planning && <PlanEditor app={app} date={date} scope={scope} rows={rows} onClose={() => setPlanning(false)} />}
    {question && <QuestionDialog app={app} taskId={question} projectId={tasks.find(task => task.id === question)?.projectId ?? undefined} onClose={() => setQuestion(null)} onDone={() => setQuestion(null)} />}
    {timing && <ScheduleTaskDialog {...app} businessDate={date} selection={{ taskId: timing }} onClose={() => setTiming(null)} />}
  </section>;
}

/** Team progress for a day: one ring per person (replaces the daily-goals progress page). */
export function ProgressView(app: ModuleProps) {
  const t = useT(), [date, setDate] = useState(app.businessDate);
  const people = (app.snapshot.team ?? []).filter(member => !member.disabledAt);
  return <section className="work-home progress-team" aria-label={t('work.progress.title')}>
    <DateField label={t('work.date')} value={date} onChange={setDate} />
    {people.map(member => { const rows = dayItems(app.snapshot, date, { kind: 'person', userId: member.id }); const fraction = dayCompletion(app.snapshot.tasks, rows); return <article key={member.id} className="card progress-summary"><CompletionRing fraction={fraction} label={member.name} size={52} /><div><strong>{member.name}</strong><p className="muted">{rows.length ? completionPercent(fraction) + '% · ' + rows.length : t('work.progress.none')}</p></div></article>; })}
  </section>;
}

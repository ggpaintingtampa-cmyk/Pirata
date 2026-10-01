import { ChevronRight } from 'lucide-react';
import { laborCostCents, orderedChildren, projectLabel, subtree, weekBounds, type Project } from '@pirata/contracts/index';
import { formatDuration } from '@pirata/domain/lib/time';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, useLocale } from '../../i18n';
import { formatDateTime } from '../../i18n/locale';
import { TranslatedText } from '../../components/TranslatedText';
import { useCan } from '../../state/permissions';
import { Money } from '../../components/Money';
import { viewHref } from '../../live/navigation';
import { actualMilliseconds } from '../tasks-time/time';
import { useServerNow } from '../tasks-time/useServerNow';
import { treeCompletion } from '../work/dayList';
import '../hours/styles.css';
/** Manager project view (R-REPORT-3): everything about one project; money only for the owner (three prices for the office). */
export function InsightsView(app: ModuleProps & { projectId?: string }) {
  const t = useT(), costs = useCan('money.costs'), sales = useCan('money.sales'), now = useServerNow(app.snapshot), snapshot = app.snapshot;
  const team = snapshot.team ?? [], name = (id: string | null | undefined) => team.find(m => m.id === id)?.name ?? '—';
  const project = snapshot.projects.find(p => p.id === app.projectId);
  if (!project) {
    const week = weekBounds(app.businessDate), open = snapshot.projects.filter(p => p.status !== 'completed');
    return <section className="work-module insights-view" aria-label={t('shell.view.insights')}><p className="muted">{t('insights.pick')}</p>{!open.length && <p className="empty-state">{t('insights.none')}</p>}
      <ul className="insights-list">{open.map(p => { const roots = orderedChildren(snapshot.tasks, null, p.id); const leaves = roots.reduce((sum, r) => sum + treeCompletion(snapshot.tasks, r.id).total, 0), done = roots.reduce((sum, r) => sum + treeCompletion(snapshot.tasks, r.id).done, 0); const minutes = (snapshot.workShifts ?? []).filter(s => s.projectId === p.id && s.status === 'approved' && s.date >= week.from && s.date <= week.to).reduce((sum, s) => sum + s.minutes, 0); const questions = (snapshot.taskQuestions ?? []).filter(q => q.projectId === p.id && !q.answeredAt).length;
        return <li key={p.id}><a className="work-link-button" href={viewHref({ name: 'insights', id: p.id })}><span><strong>{p.name}</strong><small> · {t('insights.label.' + projectLabel(p, snapshot.tasks))}</small></span><span>{leaves ? Math.round(done / leaves * 100) + '%' : '—'} · {(minutes / 60).toFixed(1)} h · {questions} ?<ChevronRight size={16} aria-hidden="true" /></span></a></li>; })}</ul></section>;
  }
  return <ProjectInsights app={app} project={project} now={now} costs={costs} sales={sales} name={name} />;
}
function ProjectInsights({ app, project, now, costs, sales, name }: { app: ModuleProps; project: Project; now: number; costs: boolean; sales: boolean; name(id: string | null | undefined): string }) {
  const t = useT(), locale = useLocale(), snapshot = app.snapshot, tasks = snapshot.tasks;
  const roots = orderedChildren(tasks, null, project.id), all = roots.flatMap(root => subtree(tasks, root.id));
  const leaves = roots.reduce((sum, r) => sum + treeCompletion(tasks, r.id).total, 0), done = roots.reduce((sum, r) => sum + treeCompletion(tasks, r.id).done, 0);
  const missing = roots.filter(root => root.status !== 'done'), completed = all.filter(task => task.status === 'done' && task.completedAt).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 20);
  const questions = (snapshot.taskQuestions ?? []).filter(q => q.projectId === project.id).sort((a, b) => Number(Boolean(a.answeredAt)) - Number(Boolean(b.answeredAt)) || b.createdAt - a.createdAt);
  const requests = (snapshot.shoppingItems ?? []).filter(item => item.projectId === project.id && !item.archivedAt).sort((a, b) => Number(Boolean(a.receivedAt)) - Number(Boolean(b.receivedAt)));
  const toolsOut = (snapshot.toolSignOuts ?? []).filter(out => out.projectId === project.id && !out.returnedAt);
  const shifts = (snapshot.workShifts ?? []).filter(s => s.projectId === project.id);
  const byPerson = [...new Set(shifts.map(s => s.userId))].map(userId => ({ userId, approved: shifts.filter(s => s.userId === userId && s.status === 'approved').reduce((sum, s) => sum + s.minutes, 0), pending: shifts.filter(s => s.userId === userId && s.status === 'submitted').reduce((sum, s) => sum + s.minutes, 0) }));
  const timed = all.reduce((sum, task) => sum + (actualMilliseconds(snapshot, task.id, now) ?? 0), 0), estimated = all.reduce((sum, task) => sum + task.estimatedMinutes * 60000, 0);
  const expenses = snapshot.expenses.filter(e => e.projectId === project.id).reduce((sum, e) => sum + e.amountCents, 0), labor = laborCostCents(snapshot.workShifts ?? [], snapshot.payRates ?? [], { projectId: project.id });
  const client = snapshot.clients.find(c => c.id === project.clientId)?.name ?? project.clientName, days = Math.max(1, Math.round((now - project.createdAt) / 86_400_000));
  return <section className="work-module insights-view" aria-label={project.name}>
    <header className="card"><div className="task-results-heading"><span><strong>{project.name}</strong> · <span className="badge">{t('insights.label.' + projectLabel(project, tasks))}</span></span><button type="button" className="work-link-button" onClick={() => app.onOpenProject(project.id)}>{t('insights.openProject')}<ChevronRight size={15} aria-hidden="true" /></button></div><p className="muted">{client}{project.startDate ? ' · ' + project.startDate : ''}{project.endDate ? ' → ' + project.endDate : ''} · {t('insights.daysActive', { days })}</p></header>
    <div className="insights-blocks">
      <div className="insights-block"><h3>{t('insights.progress')}</h3><p><strong>{leaves ? Math.round(done / leaves * 100) : 0}%</strong> · {t('work.steps', { done, total: leaves })}</p><p className="muted">{t('insights.timers', { actual: formatDuration(timed), estimate: formatDuration(estimated) })}</p></div>
      <div className="insights-block"><h3>{t('insights.missing')} <span className="directory-count">{missing.length}</span></h3><ul>{missing.map(task => { const c = treeCompletion(tasks, task.id); return <li key={task.id}><button type="button" className="work-link-button" onClick={() => app.onOpenTask(task.id)}><TranslatedText kind="task" id={task.id} field="title" text={task.title} compact /></button><small>{task.status === 'blocked' ? t('work.blocked') + ' · ' : ''}{c.total > 1 ? t('work.steps', { done: c.done, total: c.total }) : ''}{task.assigneeId ? ' · ' + name(task.assigneeId) : ' · ' + t('work.unassigned')}</small></li>; })}{!missing.length && <li className="muted">{t('insights.allDone')}</li>}</ul></div>
      <div className="insights-block"><h3>{t('insights.completed')}</h3><ul>{completed.map(task => <li key={task.id}><TranslatedText kind="task" id={task.id} field="title" text={task.title} compact /><small>{t('report.by', { name: name(task.completedBy), time: formatDateTime(locale, task.completedAt ?? 0) })}</small></li>)}{!completed.length && <li className="muted">{t('report.nothing')}</li>}</ul></div>
      <div className="insights-block"><h3>{t('insights.questions')} <span className="directory-count">{questions.filter(q => !q.answeredAt).length}</span></h3><ul>{questions.slice(0, 10).map(q => <li key={q.id}><TranslatedText kind="question" id={q.id} field="body" text={q.body} compact /><small>{q.answeredAt ? t('report.answered', { name: name(q.answeredBy) }) + ': ' + q.answer : t('report.open')} · {name(q.askedBy)}</small></li>)}{!questions.length && <li className="muted">{t('report.nothing')}</li>}</ul></div>
      <div className="insights-block"><h3>{t('insights.materials')} <span className="directory-count">{requests.filter(r => !r.receivedAt).length}</span></h3><ul>{requests.slice(0, 10).map(item => <li key={item.id}><TranslatedText kind="materialRequest" id={item.id} field="title" text={item.title} compact />{item.quantity ? ' × ' + item.quantity : ''}<small>{item.receivedAt ? t('report.received') : t('report.requested')} · {name(item.createdBy)}</small></li>)}{!requests.length && <li className="muted">{t('report.nothing')}</li>}</ul></div>
      <div className="insights-block"><h3>{t('insights.tools')} <span className="directory-count">{toolsOut.length}</span></h3><ul>{toolsOut.map(out => <li key={out.id}>{snapshot.equipment.find(e => e.id === out.equipmentId)?.name ?? '—'}<small>{name(out.takenBy)} · {formatDateTime(locale, out.takenAt)}</small></li>)}{!toolsOut.length && <li className="muted">{t('report.nothing')}</li>}</ul></div>
      <div className="insights-block"><h3>{t('insights.hours')}</h3><ul>{byPerson.map(row => <li key={row.userId}>{name(row.userId)}<small>{(row.approved / 60).toFixed(1)} h {t('hours.status.approved').toLowerCase()}{row.pending ? ' · ' + (row.pending / 60).toFixed(1) + ' h ' + t('hours.status.submitted').toLowerCase() : ''}</small></li>)}{!byPerson.length && <li className="muted">{t('report.nothing')}</li>}</ul></div>
      {(costs || sales) && <div className="insights-block insights-money"><h3>{t('insights.money')}</h3><table><tbody>
        <tr><td>{t('insights.salesPrice')}</td><td><Money cents={project.salesPriceCents} /></td></tr><tr><td>{t('insights.materialsPrice')}</td><td><Money cents={project.materialsPriceCents} /></td></tr><tr><td>{t('insights.laborPrice')}</td><td><Money cents={project.laborPriceCents} /></td></tr>
        {costs && <><tr><td>{t('insights.expenses')}</td><td><Money cents={expenses} /></td></tr><tr><td>{t('insights.laborCost')}</td><td><Money cents={labor} /></td></tr><tr className="profit"><td>{t('insights.profit')}</td><td><Money cents={project.salesPriceCents === null || project.salesPriceCents === undefined ? null : project.salesPriceCents - expenses - labor} /></td></tr></>}
      </tbody></table></div>}
    </div>
  </section>;
}

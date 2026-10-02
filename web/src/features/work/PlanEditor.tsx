import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { dayItems, orderedChildren, presence, taskDepth, type DayAssignment, type DayScope, type Task } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { useCan } from '../../state/permissions';
import { DateField } from '../../components/DateField';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { runCommand } from './commands';
/** Plan a person's day or a project pool: pick nodes from the project tree, order them, save (R-DAILY-3). */
export function PlanEditor({ app, date, scope, rows, onClose }: { app: ModuleProps; date: string; scope: DayScope; rows: readonly DayAssignment[]; onClose(): void }) {
  const t = useT(), canOthers = useCan('plan.others'), tasks = app.snapshot.tasks, projects = app.snapshot.projects.filter(p => p.status !== 'completed');
  const [ids, setIds] = useState(rows.map(row => row.taskId!).filter(Boolean));
  const [project, setProject] = useState(scope.kind === 'project' ? scope.projectId : 'all');
  const personName=scope.kind==='person'?app.snapshot.team?.find(member=>member.id===scope.userId)?.name??'':'';
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copyDate, setCopyDate] = useState(date), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [people, setPeople] = useState<string[]>(scope.kind === 'project' ? presence(app.snapshot, date, scope.projectId) : []);
  const team = (app.snapshot.team ?? []).filter(member => !member.disabledAt);
  const chosen = ids.map(id => tasks.find(task => task.id === id)).filter((task): task is Task => Boolean(task));
  const move = (index: number, delta: number) => { const next = [...ids]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setIds(next); };
  const save = async () => {
    setBusy(true);
    let message = await runCommand(app, { type: 'dayList.replace', date, scope, taskIds: ids });
    if (!message && scope.kind === 'project' && canOthers) message = await runCommand(app, { type: 'dayList.setPresence', date, projectId: scope.projectId, userIds: people });
    setBusy(false); setError(message ?? '');
    if (!message) { app.onSaved(t('work.plan.saved')); onClose(); }
  };
  const Node = ({ task }: { task: Task }) => {
    const children = orderedChildren(tasks, task.id, task.projectId ?? null), depth = taskDepth(tasks, task.id), added = ids.includes(task.id);
    return <li className={'plan-node depth-' + depth}>
      <div className="plan-node-row">
        {children.length ? <button type="button" className="plan-node-toggle" aria-expanded={Boolean(open[task.id])} aria-label={task.title} onClick={() => setOpen({ ...open, [task.id]: !open[task.id] })}>{open[task.id] ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}</button> : <span className="plan-node-spacer" />}
        <span className={'plan-node-title' + (task.status === 'done' ? ' is-done' : '')}>{task.title}<small>{app.snapshot.team?.find(member=>member.id===task.assigneeId)?.name??t('work.unassigned')}{project==='all'?' · '+(projects.find(item=>item.id===task.projectId)?.name??''):''}</small></span>
        <button type="button" disabled={added} onClick={() => setIds([...ids, task.id])}><Plus size={14} aria-hidden="true" />{added ? t('work.plan.added') : t('work.plan.add')}</button>
      </div>
      {open[task.id] && children.length > 0 && <ul className="plan-tree">{children.map(child => <Node key={child.id} task={child} />)}</ul>}
    </li>;
  };
  const roots = project==='all'?projects.flatMap(item=>orderedChildren(tasks,null,item.id)):project?orderedChildren(tasks,null,project):[];
  return <WorkDialog title={t('work.planTitle', { date })} className="plan-editor-dialog" onClose={onClose}>
    {scope.kind==='person'&&<p className="plan-person-context"><strong>{t('work.dayHint',{name:personName,date})}</strong><br/>{t('work.plan.assignmentHint')}</p>}
    {scope.kind === 'person' && <label className="work-field">{t('work.plan.project')}<select value={project} onChange={e => setProject(e.target.value)}><option value="all">{t('work.allProjects')}</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {!projects.length && <p className="empty-state">{t('work.plan.noProjects')}</p>}
    <h3>{t(project==='all'?'work.allTasks':'work.plan.browse')}</h3>
    {project && !roots.length && <p className="empty-state">{t('work.empty')}</p>}
    <ul className="plan-tree">{roots.map(task => <Node key={task.id} task={task} />)}</ul>
    <h3>{t('work.plan.chosen')}</h3>
    <p className="muted plan-times-hint">{t('work.plan.timesHint')}</p>
    {!chosen.length && <p className="empty-state">{t('work.plan.nothing')}</p>}
    <ol className="plan-chosen">{chosen.map((task, index) => <li key={task.id}><span>{index + 1}. {task.title}<small>{app.snapshot.projects.find(p => p.id === task.projectId)?.name}</small></span>
      <span className="plan-chosen-actions"><button type="button" aria-label={t('work.plan.up')} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} aria-hidden="true" /></button><button type="button" aria-label={t('work.plan.down')} disabled={index === chosen.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} aria-hidden="true" /></button><button type="button" aria-label={t('work.plan.remove')} onClick={() => setIds(ids.filter(id => id !== task.id))}><X size={14} aria-hidden="true" /></button></span></li>)}</ol>
    <div className="plan-copy"><DateField label={t('work.plan.copy')} value={copyDate} onChange={setCopyDate} /><button type="button" onClick={() => setIds(dayItems(app.snapshot, copyDate, scope).map(row => row.taskId!).filter(Boolean))}>{t('work.plan.copyButton')}</button></div>
    {scope.kind === 'project' && canOthers && <fieldset className="plan-presence"><legend>{t('work.plan.presence')}</legend>{team.map(member => <label key={member.id}><input type="checkbox" checked={people.includes(member.id)} onChange={e => setPeople(e.target.checked ? [...people, member.id] : people.filter(id => id !== member.id))} />{member.name}</label>)}</fieldset>}
    {error && <p role="alert" className="work-error">{error}</p>}
    <div className="live-actions"><button type="button" className="work-primary" disabled={busy} onClick={() => void save()}>{t('work.plan.save')}</button><button type="button" onClick={onClose}>{t('work.plan.cancel')}</button></div>
  </WorkDialog>;
}

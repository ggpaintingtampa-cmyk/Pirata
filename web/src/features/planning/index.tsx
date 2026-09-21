import { useState } from 'react';
import type { Objective } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { WorkForm, type Values } from '../tasks-time/WorkForm';
import { clockMinute, minute } from '../tasks-time/time';
import './styles.css';
export { CalendarView } from './CalendarView';

const fields = ['id', 'title', 'taskId', 'status', 'note'] as const;
function objectiveValues(objectives: Objective[]): Values {
  const values: Values = { count: String(objectives.length) };
  objectives.forEach((o, i) => fields.forEach(f => { values[`objectives.${i}.${f}`] = o[f] ?? ''; }));
  return values;
}
function reordered(v: Values, from: number, to: number): Values {
  const next = { ...v };
  for (const f of fields) { next[`objectives.${from}.${f}`] = v[`objectives.${to}.${f}`]; next[`objectives.${to}.${f}`] = v[`objectives.${from}.${f}`]; }
  return next;
}
export function ObjectiveEditor(app: ModuleProps) {
  const [explicitDate, setDate] = useState<string | null>(null), [editing, setEditing] = useState<string | null>(null);
  const chosenDate = explicitDate ?? app.businessDate;
  const objectives = app.snapshot.objectives.filter(o => o.date === chosenDate).sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  return <section className="work-module planning-module" aria-label="Daily objectives"><h2>Daily objectives</h2><label className="work-field">Objective date<input type="date" value={chosenDate} onChange={e => setDate(e.target.value)} /></label>
    <p>{objectives.filter(o => o.status === 'done').length} of {objectives.length} completed</p>
    {!objectives.length && <p>Choose up to three outcomes for today.</p>}
    {objectives.map(o => <article key={o.id}><h3>{o.title}</h3><p>{o.status}</p><p>{o.note}</p>{o.taskId && <button onClick={() => app.onOpenTask(o.taskId!)}>Open linked task</button>}</article>)}
    <button disabled={!chosenDate} onClick={() => setEditing(chosenDate)}>Edit outcomes</button>
    {editing && <WorkDialog title="Edit daily objectives" onClose={() => setEditing(null)}><WorkForm app={app} initial={objectiveValues(app.snapshot.objectives.filter(o => o.date === editing).sort((a, b) => a.rank - b.rank))}
      command={v => ({ type: 'objectives.replaceForDate', date: editing, objectives: Array.from({ length: Number(v.count) }, (_, i) => ({ id: v[`objectives.${i}.id`], title: v[`objectives.${i}.title`], taskId: v[`objectives.${i}.taskId`] || null, status: v[`objectives.${i}.status`] as Objective['status'], note: v[`objectives.${i}.note`], rank: i })) })}
      message="Daily objectives saved." done={() => setEditing(null)}>
      {d => <><p>Outcomes for {editing}. Completing an outcome does not complete its linked task.</p>
        {Number(d.values.count) === 0 && <p>Choose up to three outcomes for today.</p>}
        {Array.from({ length: Number(d.values.count) }, (_, i) => <article key={d.values[`objectives.${i}.id`]}><h3>Outcome {i + 1}</h3>
          {d.field(`objectives.${i}.title`, `Outcome ${i + 1} title`)}
          {d.field(`objectives.${i}.taskId`, `Outcome ${i + 1} linked task`, { options: [{ value: '', label: 'No linked task' }, ...app.snapshot.tasks.map(t => ({ value: t.id, label: t.title }))] })}
          {d.field(`objectives.${i}.status`, `Outcome ${i + 1} status`, { options: ['open', 'partial', 'blocked', 'done'].map(s => ({ value: s, label: s })) })}
          {d.field(`objectives.${i}.note`, `Outcome ${i + 1} note`, { type: 'textarea', hint: 'A blocked outcome needs an explanation.' })}
          <div className="work-actions"><button type="button" data-dirty disabled={i === 0} aria-label={`Move outcome ${i + 1} up`} onClick={() => d.replace(reordered(d.values, i, i - 1))}>Up</button>
            <button type="button" data-dirty disabled={i === Number(d.values.count) - 1} aria-label={`Move outcome ${i + 1} down`} onClick={() => d.replace(reordered(d.values, i, i + 1))}>Down</button>
            <button type="button" data-dirty aria-label={`Remove outcome ${i + 1}`} onClick={() => { const next: Values = { ...d.values, count: String(Number(d.values.count) - 1) }; for (let n = i; n < Number(next.count); n++) for (const f of fields) next[`objectives.${n}.${f}`] = d.values[`objectives.${n + 1}.${f}`]; d.replace(next); }}>Remove</button></div>
        </article>)}
        <button type="button" data-dirty disabled={Number(d.values.count) >= 3} onClick={() => { const i = Number(d.values.count); d.replace({ ...d.values, count: String(i + 1), [`objectives.${i}.id`]: crypto.randomUUID(), [`objectives.${i}.title`]: '', [`objectives.${i}.taskId`]: '', [`objectives.${i}.status`]: 'open', [`objectives.${i}.note`]: '' }); }}>Add outcome</button>
      </>}
    </WorkForm></WorkDialog>}
  </section>;
}

export function ScheduleTaskDialog(app: ModuleProps) {
  const selected = app.selection?.taskId ?? '', existing = app.snapshot.schedule.find(b => b.taskId === selected);
  return <WorkDialog title="Plan a task" onClose={app.onClose}><WorkForm app={app}
    initial={{ taskId: selected, 'block.date': existing?.date ?? app.businessDate, 'block.startMinute': clockMinute(existing?.startMinute ?? 540), 'block.endMinute': clockMinute(existing?.endMinute ?? 600), 'block.allowOverlap': 'false', operation: 'save' }}
    command={v => v.operation === 'remove' ? { type: 'schedule.removeTaskBlock', taskId: v.taskId } : { type: 'schedule.setTaskBlock', taskId: v.taskId, block: { date: v['block.date'], startMinute: minute(v['block.startMinute']), endMinute: minute(v['block.endMinute']), allowOverlap: v['block.allowOverlap'] === 'true' } }}
    message="Task plan saved." done={app.onClose}>
    {d => { const saved = app.snapshot.schedule.find(b => b.taskId === d.values.taskId);
      const task=app.snapshot.tasks.find(task=>task.id===d.values.taskId);
      const overlaps = app.snapshot.schedule.filter(b => b.id !== saved?.id && b.date === d.values['block.date'] && b.startMinute < minute(d.values['block.endMinute']) && minute(d.values['block.startMinute']) < b.endMinute&&(!b.taskId||!task?.assigneeId||!app.snapshot.tasks.find(task=>task.id===b.taskId)?.assigneeId||app.snapshot.tasks.find(task=>task.id===b.taskId)?.assigneeId===task.assigneeId)).sort((a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id));
      return <><p>Plans use America/New_York business time. End must follow start on the same date. Non-task commitments are informational.</p>
        {d.field('taskId', 'Task to schedule', { options: [{ value: '', label: 'Choose a task' }, ...app.snapshot.tasks.filter(t=>!t.archivedAt).map(t => ({ value: t.id, label: t.title }))], change: (taskId, v) => { const plan = app.snapshot.schedule.find(b => b.taskId === taskId); return { ...v, taskId, 'block.date': plan?.date ?? app.businessDate, 'block.startMinute': clockMinute(plan?.startMinute ?? 540), 'block.endMinute': clockMinute(plan?.endMinute ?? 600), 'block.allowOverlap': 'false' }; } })}
        {saved && <p>Current plan: {saved.date}, {clockMinute(saved.startMinute)}–{clockMinute(saved.endMinute)}. Saving updates this block.</p>}
        {d.field('operation', 'Plan action', { options: [{ value: 'save', label: 'Save or reschedule' }, { value: 'remove', label: 'Remove task plan' }] })}
        {d.values.operation === 'save' ? <>{d.field('block.date', 'Planned date', { type: 'date' })}{d.field('block.startMinute', 'Start time', { hint: 'HH:MM from 00:00 to 23:59.' })}{d.field('block.endMinute', 'End time', { hint: 'HH:MM up to 24:00. No overnight inference.' })}
          {overlaps.length > 0 && <div role="alert"><p>This block overlaps:</p><ul>{overlaps.map(b => <li key={b.id}>{b.title} · {clockMinute(b.startMinute)}–{clockMinute(b.endMinute)}</li>)}</ul><p>Other blocks will stay in place. Explicitly choose Save with overlap to keep this conflict.</p></div>}
          {d.field('block.allowOverlap', 'Overlap choice', { options: [{ value: 'false', label: 'Do not allow overlap' }, { value: 'true', label: 'Save with overlap' }] })}</> : <p>Remove only this task’s planned block? Task history and other plans will remain.</p>}
      </>;
    }}
  </WorkForm></WorkDialog>;
}

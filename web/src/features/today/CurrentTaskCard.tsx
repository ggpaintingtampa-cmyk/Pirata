import { Clock3, Play, Pause, Check, ArrowRight } from 'lucide-react';
import type { AppState, Task } from '../../domain/types';
import { actualTaskTime, estimateVariance, projectName } from '../../domain/selectors';
import { formatClock, formatDuration } from '../../lib/time';
import { StatusBadge } from '../../components/StatusBadge';
export function CurrentTaskCard({ state, task, now, onChoose, onStart, onPause, onFinish, onEdit, onTime, onAdd, onClock }: { state: AppState; task: Task | null; now: number; onChoose: (id: string) => void; onStart: () => void; onPause: () => void; onFinish: () => void; onEdit: () => void; onTime: () => void; onAdd: () => void; onClock: () => void }) {
  const active = state.runningTimer;
  const running = !!active && active.taskId === task?.id;
  const actual = task ? actualTaskTime(state, task.id, now) : 0;
  const variance = task ? estimateVariance(task, actual) : null;
  return <section className="card current-card" aria-labelledby="current-heading"><div className="section-heading"><h2 id="current-heading"><Clock3 size={21} />Current task</h2>{task && <button className="text-button" onClick={onEdit}>Details<ArrowRight size={16} /></button>}</div>
    {task ? <>
      <p className="project-label">{projectName(state, task.projectId)}</p><div className="task-title-row"><h3>{task.title}</h3><StatusBadge status={task.status} /></div>
      <p className="time-comparison">Estimated <strong>{formatDuration(task.estimatedMinutes * 60000)}</strong><span aria-hidden="true"> • </span>Logged <strong>{formatDuration(actual)}</strong></p>
      <div className="task-progress" aria-hidden="true"><div style={{ width: Math.min(100, actual / (task.estimatedMinutes * 60000) * 100) + '%' }} /></div>
      {variance && <p className="variance">{variance}</p>}
      {active && <div className="timer-session">
        <div><span className="running-dot" /><strong>{running ? 'Session running' : 'Timer running on ' + state.tasks.find(t => t.id === active.taskId)?.title}</strong><span className="timer-digits">{formatClock(now - active.startedAt)}</span></div>
        <small>Continues while this page is closed, until you pause it.</small>
        {!running && <button className="text-button" onClick={() => onChoose(active.taskId)}>Return to running task</button>}
      </div>}
      {active && now < active.startedAt && <div className="inline-warning" role="alert"><p>The system clock moved backward. Correct the start time or discard this session before continuing.</p><button className="secondary" onClick={onClock}>Correct active timer</button></div>}
      <div className="task-actions">{running ? <button className="primary" onClick={onPause}><Pause size={19} />Pause timer</button> : <button className="primary" onClick={onStart} disabled={task.status !== 'open'}><Play size={19} />Start timer</button>}<button className="secondary" onClick={onFinish} disabled={task.status === 'done'}><Check size={19} />Finish task</button></div>
      {task.status !== 'open' && <p className="muted">Open Details to explicitly reopen this task before starting.</p>}
      <div className="current-footer"><div className="task-chooser"><label htmlFor="selected-task">Choose task</label><select id="selected-task" value={task.id} onChange={e => onChoose(e.target.value)}>{state.tasks.map(t => <option key={t.id} value={t.id}>{t.title}{t.status === 'open' ? '' : ' (' + t.status + ')'}</option>)}</select></div><button className="text-button" onClick={onTime}>Time entries</button></div>
    </> : <div className="empty-state"><p>No task selected</p><button className="primary" onClick={onAdd}>Add task</button>{state.tasks.length > 0 && <div className="task-chooser"><label htmlFor="selected-task">Choose task</label><select id="selected-task" value="" onChange={e => onChoose(e.target.value)}><option value="" disabled>Choose a saved task</option>{state.tasks.map(t => <option key={t.id} value={t.id}>{t.title} ({t.status})</option>)}</select></div>}</div>}
  </section>;
}

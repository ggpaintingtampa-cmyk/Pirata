import { CalendarDays, ArrowUpRight, Check } from 'lucide-react';
import type { AppState } from '../../domain/types';
import { timeline, overlaps, projectName } from '../../domain/selectors';
import { minuteLabel } from '../../lib/dates';
import { EmptyState } from '../../components/EmptyState';
export function ScheduleCard({ state, date, onTask }: { state: AppState; date: string; onTask: (id: string) => void }) {
  const blocks = timeline(state, date);
  return <section className="card schedule-card" aria-labelledby="schedule-heading"><div className="section-heading"><h2 id="schedule-heading"><CalendarDays size={21} />Today's schedule</h2><span className="count-label">{blocks.length} blocks</span></div>
    {blocks.length ? <ol className="schedule-list">{blocks.map(b => {
      const task = state.tasks.find(t => t.id === b.taskId), conflict = overlaps(state, b).length > 0;
      const content = <><span className="schedule-time">{minuteLabel(b.startMinute)}<small>{minuteLabel(b.endMinute)}</small></span><span className={'schedule-marker ' + b.kind} aria-hidden="true" /><span className="schedule-copy"><strong>{task?.title ?? b.title}</strong><small>{task ? projectName(state, task.projectId) : b.kind.replace('_', ' ')}</small>{conflict && <span className="conflict-label">Overlapping block</span>}</span>{task?.status === 'done' ? <span className="schedule-end"><Check size={17} /><small>Done</small></span> : task ? <ArrowUpRight size={18} /> : null}</>;
      return <li key={b.id}>{b.taskId ? <button className="schedule-row" onClick={() => onTask(b.taskId!)}>{content}</button> : <div className="schedule-row informational">{content}</div>}</li>;
    })}</ol> : <EmptyState>No blocks scheduled for today.</EmptyState>}
    <p className="card-footnote">Plans stay in place as tasks are completed.</p>
  </section>;
}

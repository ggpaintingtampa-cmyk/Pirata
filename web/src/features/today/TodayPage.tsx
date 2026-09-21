import { useApp } from '../../state/AppProvider';
import { todaysObjectives, attentionItems } from '../../domain/selectors';
import { newId } from '../../lib/ids';
import { ObjectivesCard } from './ObjectivesCard';
import { CurrentTaskCard } from './CurrentTaskCard';
import { ScheduleCard } from './ScheduleCard';
import { AttentionCard } from './AttentionCard';
import { SpendingCard } from './SpendingCard';
export function TodayPage() {
  const { state, snapshot, date, now, selected, setSelectedTaskId, setDialog, execute } = useApp();
  if (!state) return <div className="card recovery"><h2>Today is waiting</h2><p>Resolve the storage notice above to open your demo.</p></div>;
  const blocked = !['ready', 'memory'].includes(snapshot.mode);
  return <div className="today-grid" inert={blocked || undefined}>
    <div className="main-column">
      <ObjectivesCard objectives={todaysObjectives(state, date)} onEdit={() => setDialog({ kind: 'objectives' })} />
      <CurrentTaskCard state={state} task={selected} now={now} onChoose={setSelectedTaskId} onStart={() => {
        if (!selected) return;
        if (state.runningTimer && state.runningTimer.taskId !== selected.id) setDialog({ kind: 'switch', taskId: selected.id });
        else execute({ type: 'start', taskId: selected.id, sessionId: newId(), now: Date.now() }, 'Timer started.', false);
      }} onPause={() => execute({ type: 'pause', now: Date.now() }, 'Timer paused. Time recorded.', false)} onFinish={() => selected && execute({ type: 'task', task: { ...selected, status: 'done' } }, 'Task finished. Its objective and planned schedule stay available.', false)} onEdit={() => selected && setDialog({ kind: 'task', id: selected.id })} onTime={() => selected && setDialog({ kind: 'timeEntries', id: selected.id })} onAdd={() => setDialog({ kind: 'quick', form: 'task' })} onClock={() => setDialog({ kind: 'clock' })} />
      <ScheduleCard state={state} date={date} onTask={id => setDialog({ kind: 'task', id })} />
    </div>
    <aside className="side-column"><AttentionCard items={attentionItems(state, date)} onView={item => setDialog({ kind: 'attention', item })} /><SpendingCard state={state} date={date} onAll={() => setDialog({ kind: 'expenses' })} onEdit={expense => setDialog({ kind: 'quick', form: 'expense', recordId: expense.id })} /><div className="local-note"><span className="local-dot" /><span>One day at a time.<br /><small>{snapshot.mode === 'memory' ? 'Kept in memory for this session.' : 'Demo data saved in this browser.'}</small></span></div></aside>
  </div>;
}

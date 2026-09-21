import { useApp } from '../../state/AppProvider';
import { entryMilliseconds, formatDuration } from '../../lib/time';
import { EmptyState } from '../../components/EmptyState';
export function TimeEntriesDialog({ id }: { id: string }) {
  const { state, setDialog } = useApp();
  const task = state!.tasks.find(t => t.id === id)!;
  const entries = state!.timeEntries.filter(e => e.taskId === id);
  return <><p className="dialog-intro">{task.title}</p>{state!.runningTimer?.taskId === id && <p className="info-panel">An active session is running. Pause it before correcting its recorded interval.</p>}
    {entries.length ? <ul className="record-list">{entries.map(e => <li key={e.id}><div><strong>{formatDuration(entryMilliseconds(e))}</strong><small>{e.source === 'manual' ? e.date + ' · Manual' : new Date(e.startedAt).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' → ' + new Date(e.endedAt).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' · New York'}</small>{e.note && <p>{e.note}</p>}</div><button className="secondary" data-clean onClick={() => setDialog({ kind: 'quick', form: 'time', recordId: e.id })}>Edit<span className="sr-only"> time entry</span></button></li>)}</ul> : <EmptyState>No completed time entries yet.</EmptyState>}
    <button className="primary wide-button" data-clean onClick={() => setDialog({ kind: 'quick', form: 'time', taskId: id })}>Add time entry</button><div className="form-footer"><button className="secondary" data-cancel>Close</button></div>
  </>;
}

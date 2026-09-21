import { useState } from 'react';
import { useApp } from '../../state/AppProvider';
import { newId } from '../../lib/ids';
import { timestampInput } from '../../lib/dates';
import { Field, FormFooter, fieldProps, useForm, type Errors } from '../quick-add/formUtils';
export function SwitchTimerDialog({ taskId }: { taskId: string }) {
  const { state, execute } = useApp();
  const [sessionId] = useState(newId);
  const [error, setError] = useState('');
  const task = state!.tasks.find(t => t.id === taskId)!;
  const runningTask = state!.tasks.find(t => t.id === state!.runningTimer?.taskId);
  return <><p>Pause <strong>{runningTask?.title}</strong> and start <strong>{task.title}</strong>?</p><p className="muted">The current session will be recorded before the next one starts.</p>{error && <p role="alert" className="field-error">{error}</p>}<div className="form-footer"><button className="secondary" data-cancel>Cancel</button><button className="primary" onClick={() => { const result = execute({ type: 'start', taskId, sessionId, now: Date.now(), switchConfirmed: true }, 'Timer switched to ' + task.title + '.'); if (!result.ok) setError(result.error); }}>Pause and switch</button></div></>;
}
export function ClockCorrectionDialog() {
  const { state, execute } = useApp();
  const form = useForm({ start: state!.runningTimer ? timestampInput(state!.runningTimer.startedAt) : '' });
  const [discard, setDiscard] = useState(false);
  const [discardError, setDiscardError] = useState('');
  return <form noValidate onSubmit={event => {
    const start = new Date(form.values.start).getTime(), errors: Errors = {};
    if (!Number.isFinite(start) || start < 0 || start > Date.now()) errors.start = 'Enter a valid start at or before the current time.';
    form.submit(event, errors, () => execute({ type: 'correctTimer', startedAt: start, now: Date.now() }, 'Active timer start corrected.'));
  }}><p>The clock moved backward. Choose the actual start explicitly, or discard only the active session. Completed entries remain.</p><Field name="start" label="Corrected start time" error={form.errors.start} hint={'Browser local timezone: ' + Intl.DateTimeFormat().resolvedOptions().timeZone}><input {...fieldProps('start', form)} type="datetime-local" step="1" /></Field>
    {discard ? <div className="inline-warning"><p>Discard this active session without recording its time?</p><button className="danger" type="button" onClick={() => { const result = execute({ type: 'discardTimer' }, 'Active session discarded.'); if (!result.ok) setDiscardError(result.error); }}>Confirm discard session</button></div> : <button className="text-button danger-text" type="button" onClick={() => setDiscard(true)}>Discard active session</button>}
    {discardError && <p className="field-error" role="alert">{discardError}</p>}<FormFooter form={form} label="Save corrected start" />
  </form>;
}

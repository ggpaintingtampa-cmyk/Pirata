import { useState } from 'react';
import { useApp } from '../../state/AppProvider';
import { dateSchema } from '../../domain/schema';
import { newId } from '../../lib/ids';
import { minuteLabel, parseTime } from '../../lib/dates';
import { overlaps } from '../../domain/selectors';
import { Field, FormFooter, fieldProps, useForm, type Errors } from '../quick-add/formUtils';
export function ScheduleTaskDialog({ id }: { id: string }) {
  const { state, date, execute } = useApp();
  const task = state!.tasks.find(t => t.id === id)!;
  const block = state!.schedule.find(b => b.taskId === id);
  const [blockId] = useState(() => block?.id ?? newId());
  const [removeError, setRemoveError] = useState('');
  const form = useForm({ date: block?.date ?? date, start: minuteLabel(block?.startMinute ?? 540), end: minuteLabel(block?.endMinute ?? Math.min(1440, 540 + task.estimatedMinutes)) });
  const v = form.values, start = parseTime(v.start), end = v.end === '24:00' ? 1440 : parseTime(v.end);
  const conflicts = start !== null && end !== null ? overlaps(state!, { date: v.date, startMinute: start, endMinute: end, taskId: id }) : [];
  return <form noValidate onSubmit={event => {
    const errors: Errors = {};
    form.check('date', v.date, dateSchema, errors);
    if (start === null) errors.start = 'Enter a valid start time.';
    if (end === null || start === null || end <= start) errors.end = 'End must be after start within the same day. Overnight blocks are not supported.';
    form.submit(event, errors, () => execute({ type: 'schedule', taskId: id, block: { id: blockId, date: v.date, startMinute: start!, endMinute: end!, kind: 'task', title: task.title, taskId: id } }, 'Schedule updated. Other blocks are unchanged.'));
  }}>
    <p className="dialog-intro">{task.title}</p><Field name="date" label="Schedule date" error={form.errors.date}><input {...fieldProps('date', form)} type="date" /></Field>
    <div className="form-grid"><Field name="start" label="Start time" error={form.errors.start}><input {...fieldProps('start', form)} type="time" /></Field><Field name="end" label="End time (24-hour)" error={form.errors.end} hint="HH:MM; use 24:00 for the end of the day."><input {...fieldProps('end', form)} placeholder="11:00" /></Field></div>
    {conflicts.length > 0 && <div className="inline-warning" role="status"><strong>Schedule overlap</strong><p>Conflicts with {conflicts.map(b => b.title).join(', ')}. You can save this plan; other blocks will stay in place.</p></div>}
    {block && <button type="button" className="text-button danger-text" data-navigate onClick={() => { const result = execute({ type: 'schedule', taskId: id, block: null }, 'Task removed from the schedule.'); if (!result.ok) setRemoveError(result.error); }}>Remove from schedule</button>}
    {removeError && <p className="field-error" role="alert">{removeError}</p>}<FormFooter form={form} label="Save schedule" />
  </form>;
}

import { useState } from 'react';
import { useApp } from '../../state/AppProvider';
import { dateSchema, minutesSchema, noteSchema } from '../../domain/schema';
import { newId } from '../../lib/ids';
import { timestampInput } from '../../lib/dates';
import { Field, FormFooter, fieldProps, useForm, type Errors } from './formUtils';
export function TimeEntryForm({ recordId, taskId }: { recordId?: string; taskId?: string }) {
  const { state, date, execute } = useApp();
  const existing = state!.timeEntries.find(e => e.id === recordId);
  const [id] = useState(() => existing?.id ?? newId());
  const timer = existing?.source === 'timer';
  const form = useForm({ task: existing?.taskId ?? taskId ?? state!.tasks[0]?.id ?? '', date: existing?.source === 'manual' ? existing.date : date, minutes: existing?.source === 'manual' ? String(existing.durationSeconds / 60) : '', note: existing?.note ?? '', start: timer ? timestampInput(existing.startedAt) : '', end: timer ? timestampInput(existing.endedAt) : '' });
  const v = form.values;
  return <form noValidate onSubmit={event => {
    const errors: Errors = {};
    if (!state!.tasks.some(t => t.id === v.task)) errors.task = 'Choose a task.';
    form.check('note', v.note, noteSchema, errors);
    const start = new Date(v.start).getTime(), end = new Date(v.end).getTime();
    if (timer) {
      if (!Number.isFinite(start) || start < 0) errors.start = 'Enter a valid start time.';
      if (!Number.isFinite(end) || end <= start) errors.end = 'End must be after start.';
    } else { form.check('date', v.date, dateSchema, errors); form.check('minutes', Number(v.minutes), minutesSchema, errors); }
    form.submit(event, errors, () => execute({ type: 'timeEntry', entry: timer ? { id, taskId: v.task, source: 'timer', startedAt: start, endedAt: end, note: v.note.trim() } : { id, taskId: v.task, source: 'manual', date: v.date, durationSeconds: Number(v.minutes) * 60, note: v.note.trim() } }, existing ? 'Time entry corrected.' : 'Time entry added.'));
  }}>
    <Field name="task" label="Task" error={form.errors.task}><select {...fieldProps('task', form)} disabled={!!existing}>{state!.tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
    {timer ? <><p className="muted">Correct the recorded interval explicitly. Times below use this browser's local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p><Field name="start" label="Recorded start" error={form.errors.start}><input {...fieldProps('start', form)} type="datetime-local" step="1" /></Field><Field name="end" label="Recorded end" error={form.errors.end}><input {...fieldProps('end', form)} type="datetime-local" step="1" /></Field></> : <div className="form-grid"><Field name="date" label="Work date" error={form.errors.date}><input {...fieldProps('date', form)} type="date" /></Field><Field name="minutes" label="Duration (whole minutes)" error={form.errors.minutes}><input {...fieldProps('minutes', form)} inputMode="numeric" /></Field></div>}
    <Field name="note" label="Note (optional)" error={form.errors.note}><textarea {...fieldProps('note', form)} rows={3} /></Field>
    <FormFooter form={form} label={existing ? 'Save correction' : 'Add time entry'} />
  </form>;
}

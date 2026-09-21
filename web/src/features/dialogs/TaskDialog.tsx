import { useApp } from '../../state/AppProvider';
import { titleSchema, minutesSchema, noteSchema } from '../../domain/schema';
import type { TaskStatus } from '../../domain/types';
import { actualTaskTime, projectName } from '../../domain/selectors';
import { formatDuration } from '../../lib/time';
import { minuteLabel } from '../../lib/dates';
import { Field, FormFooter, fieldProps, useForm, type Errors } from '../quick-add/formUtils';
export function TaskDialog({ id }: { id: string }) {
  const { state, now, setDialog, execute } = useApp();
  const task = state!.tasks.find(t => t.id === id)!;
  const block = state!.schedule.find(b => b.taskId === id);
  const form = useForm({ title: task.title, minutes: String(task.estimatedMinutes), note: task.note, status: task.status });
  const v = form.values;
  return <form noValidate onSubmit={event => {
    const errors: Errors = {};
    form.check('title', v.title, titleSchema, errors); form.check('minutes', Number(v.minutes), minutesSchema, errors); form.check('note', v.note, noteSchema, errors);
    form.submit(event, errors, () => execute({ type: 'task', task: { ...task, title: v.title.trim(), estimatedMinutes: Number(v.minutes), note: v.note.trim(), status: v.status as TaskStatus } }, 'Task updated.'));
  }}>
    <p className="project-label">{projectName(state!, task.projectId)}</p>
    <Field name="title" label="Task title" error={form.errors.title}><input {...fieldProps('title', form)} /></Field>
    <div className="form-grid"><Field name="minutes" label="Estimated minutes" error={form.errors.minutes}><input {...fieldProps('minutes', form)} inputMode="numeric" /></Field><Field name="status" label="Task status"><select {...fieldProps('status', form)}><option value="open">Open</option><option value="blocked">Blocked</option><option value="done">Done</option></select></Field></div>
    <Field name="note" label="Note (optional)" error={form.errors.note}><textarea {...fieldProps('note', form)} rows={3} /></Field>
    {state!.runningTimer?.taskId === id && <p className="inline-warning">Marking this task blocked or done closes its active timer.</p>}
    <div className="detail-actions"><div><strong>Schedule</strong><p>{block ? block.date + ' · ' + minuteLabel(block.startMinute) + '–' + minuteLabel(block.endMinute) : 'Not scheduled'}</p><small>Changing the estimate leaves this block in place.</small></div><button type="button" className="secondary" data-navigate onClick={() => setDialog({ kind: 'schedule', id })}>{block ? 'Reschedule' : 'Schedule task'}</button></div>
    <div className="detail-actions"><span><strong>{formatDuration(actualTaskTime(state!, id, now))}</strong> logged</span><button type="button" className="secondary" data-navigate onClick={() => setDialog({ kind: 'timeEntries', id })}>View time entries</button></div>
    <FormFooter form={form} label="Save task" />
  </form>;
}

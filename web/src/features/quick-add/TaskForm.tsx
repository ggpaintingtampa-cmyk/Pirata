import { useState } from 'react';
import { useApp } from '../../state/AppProvider';
import { titleSchema, minutesSchema, dateSchema } from '../../domain/schema';
import { parseTime } from '../../lib/dates';
import { newId } from '../../lib/ids';
import { overlaps } from '../../domain/selectors';
import { Field, FormFooter, fieldProps, useForm, type Errors } from './formUtils';
export function TaskForm() {
  const { state, date, execute, setSelectedTaskId } = useApp();
  const [id] = useState(newId), [blockId] = useState(newId);
  const form = useForm({ title: '', project: '', minutes: '60', date: '', start: '' });
  const v = form.values, start = parseTime(v.start), minutes = Number(v.minutes);
  const conflicts = start !== null && v.date ? overlaps(state!, { date: v.date, startMinute: start, endMinute: start + minutes }) : [];
  return <form noValidate onSubmit={event => {
    const errors: Errors = {};
    form.check('title', v.title, titleSchema, errors); form.check('minutes', minutes, minutesSchema, errors);
    if (v.date || v.start) { form.check('date', v.date, dateSchema, errors); if (start === null) errors.start = 'Enter a start time.'; else if (start + minutes > 1440) errors.start = 'This estimate crosses midnight. Choose an earlier start; overnight blocks are not supported.'; }
    form.submit(event, errors, () => {
      const result = execute({ type: 'task', task: { id, title: v.title.trim(), projectId: v.project || null, estimatedMinutes: minutes, status: 'open', note: '', createdAt: Date.now() }, ...(v.date && start !== null ? { block: { id: blockId, date: v.date, startMinute: start, endMinute: start + minutes, kind: 'task', title: v.title.trim(), taskId: id } } : {}) }, 'Task added: ' + v.title.trim());
      if (result.ok) setSelectedTaskId(id); return result;
    });
  }}>
    <Field name="title" label="Task title" error={form.errors.title}><input {...fieldProps('title', form)} autoComplete="off" /></Field>
    <Field name="project" label="Project"><select {...fieldProps('project', form)}><option value="">General business</option>{state!.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <Field name="minutes" label="Estimated minutes" error={form.errors.minutes}><input {...fieldProps('minutes', form)} inputMode="numeric" /></Field>
    <div className="form-divider">Schedule · optional</div><div className="form-grid">
      <Field name="date" label="Schedule date" error={form.errors.date}><input {...fieldProps('date', form)} type="date" /></Field>
      <Field name="start" label="Start time" error={form.errors.start}><input {...fieldProps('start', form)} type="time" /></Field>
    </div>
    <p className="muted">The first block uses the estimated duration. Today is {date}.</p>
    {conflicts.length > 0 && <p className="inline-warning" role="status">Schedule overlap with {conflicts.map(b => b.title).join(', ')}. Saving keeps all other blocks in place.</p>}
    <FormFooter form={form} label="Add task" />
  </form>;
}

import { useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppProvider';
import { todaysObjectives } from '../../domain/selectors';
import { objectiveSchema } from '../../domain/schema';
import type { Objective } from '../../domain/types';
import { newId } from '../../lib/ids';
import { Field, FormFooter, useForm, type Errors } from '../quick-add/formUtils';
export function ObjectivesDialog() {
  const { state, date, execute } = useApp();
  const [draft, setDraft] = useState(() => structuredClone(todaysObjectives(state!, date)));
  const [editingDate] = useState(date);
  const form = useForm({});
  function update(index: number, patch: Partial<Objective>) { setDraft(items => items.map((o, i) => i === index ? { ...o, ...patch } : o)); }
  function move(index: number, direction: number) { setDraft(items => { const next = [...items]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; }); }
  return <form noValidate onSubmit={event => {
    const records = draft.map((o, rank) => ({ ...o, title: o.title.trim(), note: o.note.trim(), rank }));
    const errors: Errors = {};
    records.forEach((o, index) => {
      const result = objectiveSchema.safeParse(o);
      if (!result.success) result.error.issues.forEach(issue => { errors['objective-' + String(issue.path[0]) + '-' + index] = issue.message; });
    });
    form.submit(event, errors, () => execute({ type: 'objectives', date: editingDate, objectives: records }, 'Today’s objectives updated.'));
  }}>
    <p className="dialog-intro">Choose up to three outcomes for {editingDate}. Task and objective completion are independent.</p>
    {draft.map((o, index) => <fieldset key={o.id} className="objective-editor"><legend>Objective {index + 1}</legend>
      <Field name={'objective-title-' + index} label={'Title for objective ' + (index + 1)} error={form.errors['objective-title-' + index]}><input id={'objective-title-' + index} name={'objective-title-' + index} value={o.title} aria-invalid={!!form.errors['objective-title-' + index]} aria-describedby={form.errors['objective-title-' + index] ? 'objective-title-' + index + '-error' : undefined} onChange={e => update(index, { title: e.target.value })} /></Field>
      <Field name={'objective-task-' + index} label={'Linked task for objective ' + (index + 1)}><select id={'objective-task-' + index} value={o.taskId ?? ''} onChange={e => update(index, { taskId: e.target.value || null })}><option value="">No linked task</option>{state!.tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
      <Field name={'objective-status-' + index} label={'Status for objective ' + (index + 1)}><select id={'objective-status-' + index} value={o.status} onChange={e => update(index, { status: e.target.value as Objective['status'] })}>{['open', 'partial', 'blocked', 'done'].map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></Field>
      <Field name={'objective-note-' + index} label={'Note for objective ' + (index + 1) + (o.status === 'blocked' ? ' (required)' : ' (optional)')} error={form.errors['objective-note-' + index]}><textarea id={'objective-note-' + index} name={'objective-note-' + index} rows={2} value={o.note} aria-invalid={!!form.errors['objective-note-' + index]} onChange={e => update(index, { note: e.target.value })} /></Field>
      <div className="objective-tools"><button type="button" className="secondary" data-dirty disabled={index === 0} aria-label={'Move objective ' + (index + 1) + ' up'} onClick={() => move(index, -1)}><ArrowUp size={16} />Up</button><button type="button" className="secondary" data-dirty disabled={index === draft.length - 1} aria-label={'Move objective ' + (index + 1) + ' down'} onClick={() => move(index, 1)}><ArrowDown size={16} />Down</button><button type="button" className="text-button danger-text" data-dirty aria-label={'Remove objective ' + (index + 1)} onClick={() => setDraft(items => items.filter(item => item.id !== o.id))}><Trash2 size={16} />Remove</button></div>
    </fieldset>)}
    <button type="button" className="secondary wide-button" data-dirty disabled={draft.length >= 3} onClick={() => setDraft(items => [...items, { id: newId(), date: editingDate, title: '', taskId: null, status: 'open', note: '', rank: items.length }])}><Plus size={18} />Add objective ({draft.length}/3)</button>
    <FormFooter form={form} label="Save objectives" />
  </form>;
}

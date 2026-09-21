import { useState } from 'react';
import { useApp } from '../../state/AppProvider';
import { materialShortages, projectName, quantityLabel, type AttentionItem } from '../../domain/selectors';
import { dateSchema, noteSchema } from '../../domain/schema';
import { newId } from '../../lib/ids';
import { Field, FormFooter, fieldProps, useForm, type Errors } from '../quick-add/formUtils';
function FollowUpForm({ id }: { id: string }) {
  const { state, execute } = useApp();
  const lead = state!.leads.find(l => l.id === id)!;
  const [followUpId] = useState(newId);
  const form = useForm({ note: '', next: '' }); const v = form.values;
  return <form noValidate onSubmit={event => {
    const errors: Errors = {};
    form.check('note', v.note, noteSchema.refine(n => n.length > 0, 'Enter a follow-up note.'), errors);
    if (v.next) form.check('next', v.next, dateSchema, errors);
    form.submit(event, errors, () => execute({ type: 'followUp', leadId: id, id: followUpId, now: Date.now(), note: v.note.trim(), nextDate: v.next || null }, 'Follow-up recorded for ' + lead.name + '.'));
  }}><h3>{lead.name}</h3><p>{lead.workDescription}</p><div className="info-panel"><p>{lead.phone || 'No phone entered'}</p><p>{lead.email || 'No email entered'}</p><p>Follow-up due: {lead.nextFollowUpDate ?? 'None'}</p></div>
    {lead.followUps.length > 0 && <details><summary>Previous follow-ups ({lead.followUps.length})</summary>{lead.followUps.map(f => <p key={f.id}>{f.note}</p>)}</details>}
    <Field name="note" label="Follow-up note" error={form.errors.note}><textarea {...fieldProps('note', form)} rows={3} /></Field>
    <Field name="next" label="Next follow-up date (optional)" error={form.errors.next} hint="Leave empty to clear the due reminder."><input {...fieldProps('next', form)} type="date" /></Field>
    <p className="muted">This records your follow-up. No message or email is sent.</p><FormFooter form={form} label="Mark followed up" />
  </form>;
}
export function AttentionDetailDialog({ item }: { item: AttentionItem }) {
  const { state, setDialog, execute } = useApp();
  const [actionError, setActionError] = useState('');
  if (item.kind === 'lead') return <FollowUpForm id={item.id} />;
  if (item.kind === 'maintenance') {
    const maintenance = state!.maintenance.find(m => m.id === item.id)!;
    return <><p className="project-label">{maintenance.equipmentName}</p><h3>{maintenance.title}</h3><p>Due {maintenance.dueDate}</p><p className="muted">Completing this item records the time and removes its reminder. Recurring maintenance is not generated in this demo.</p><div className="form-footer"><button className="secondary" data-cancel>Cancel</button><button className="primary" onClick={() => { const result = execute({ type: 'maintenance', id: item.id, now: Date.now() }, 'Maintenance marked complete.'); if (!result.ok) setActionError(result.error); }}>Mark complete</button></div>{actionError && <p className="field-error" role="alert">{actionError}</p>}</>;
  }
  const shortage = materialShortages(state!).find(r => r.requirementId === item.id);
  if (!shortage) return <p>The material requirement is covered.</p>;
  const material = state!.materials.find(m => m.id === shortage.materialId)!;
  return <><p className="project-label">{projectName(state!, shortage.projectId)}</p><h3>{material.name}</h3><p>{[material.product, material.color, material.finish].filter(Boolean).join(' · ')}</p><dl className="detail-list"><div><dt>Physical stock</dt><dd>{quantityLabel(material.stockMinor, material.unit)}</dd></div><div><dt>Project requirement</dt><dd>{quantityLabel(shortage.neededMinor, material.unit)}</dd></div><div><dt>Reserved for this project</dt><dd>{quantityLabel(shortage.reservedMinor, material.unit)}</dd></div><div><dt>Free stock allocated</dt><dd>{quantityLabel(shortage.allocatedMinor, material.unit)}</dd></div><div className="shortage-total"><dt>Still needed</dt><dd>{quantityLabel(shortage.missingMinor, material.unit)}</dd></div></dl><p className="muted">Physical stock includes reservations. Free stock is allocated once across projects; this calculation does not save a reservation.</p><div className="form-footer"><button className="secondary" data-cancel>Cancel</button><button className="primary" data-clean onClick={() => setDialog({ kind: 'quick', form: 'material', materialId: material.id })}>Adjust quantity</button></div></>;
}

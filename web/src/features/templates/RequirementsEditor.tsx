// P02: materials, tools and preparation notes on a template node or a task. Free text always works; a catalog reference
// is optional and only links the row to inventory or equipment. Nothing here reserves stock or signs out a tool.
import { Plus, Trash2 } from 'lucide-react';
import { REQUIREMENT_KINDS, type RequirementKind, type TemplateRequirement } from '@pirata/contracts/index';
import { useT } from '../../i18n';
export type RequirementDraft = TemplateRequirement;
export const emptyRequirement = (kind: RequirementKind = 'material'): RequirementDraft => ({ kind, name: '', materialId: null, equipmentId: null, quantity: '', unit: '', note: '' });
/** Rows ready to send: trimmed, empty names dropped, catalog ids resolved by exact name. */
export function cleanRequirements(rows: readonly RequirementDraft[], catalog: { materials: { id: string; name: string }[]; equipment: { id: string; name: string }[] }): TemplateRequirement[] {
  return rows.filter(row => row.name.trim()).slice(0, 30).map(row => {
    const name = row.name.trim();
    const materialId = row.kind === 'material' ? catalog.materials.find(m => m.name.trim().toLowerCase() === name.toLowerCase())?.id ?? null : null;
    const equipmentId = row.kind === 'tool' ? catalog.equipment.find(e => e.name.trim().toLowerCase() === name.toLowerCase())?.id ?? null : null;
    return { kind: row.kind, name, materialId, equipmentId, quantity: row.quantity.trim(), unit: row.unit.trim(), note: row.note.trim() };
  });
}
export function RequirementsEditor({ value, onChange, materials, equipment, idPrefix }: { value: RequirementDraft[]; onChange(next: RequirementDraft[]): void; materials: { id: string; name: string }[]; equipment: { id: string; name: string }[]; idPrefix: string }) {
  const t = useT();
  const update = (index: number, patch: Partial<RequirementDraft>) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <div className="requirements-editor">
    <datalist id={idPrefix + '-materials'}>{materials.map(m => <option key={m.id} value={m.name} />)}</datalist>
    <datalist id={idPrefix + '-equipment'}>{equipment.map(e => <option key={e.id} value={e.name} />)}</datalist>
    {value.map((row, index) => <div key={index} className="requirement-row">
      <div className="task-estimate-choices requirement-kind" role="group" aria-label={t('templates.requirements.kind')}>{REQUIREMENT_KINDS.map(kind => <button key={kind} type="button" aria-pressed={row.kind === kind} onClick={() => update(index, { kind })}>{t('templates.requirements.kind.' + kind)}</button>)}</div>
      <input placeholder={t('templates.requirements.name.' + row.kind)} value={row.name} list={row.kind === 'material' ? idPrefix + '-materials' : row.kind === 'tool' ? idPrefix + '-equipment' : undefined} maxLength={160} onChange={e => update(index, { name: e.target.value })} />
      {row.kind !== 'note' && <div className="requirement-amount"><input placeholder={t('templates.requirements.quantity')} value={row.quantity} maxLength={80} onChange={e => update(index, { quantity: e.target.value })} /><input placeholder={t('templates.requirements.unit')} value={row.unit} maxLength={20} onChange={e => update(index, { unit: e.target.value })} /></div>}
      <input placeholder={t('templates.requirements.note')} value={row.note} maxLength={1000} onChange={e => update(index, { note: e.target.value })} />
      <button type="button" aria-label={t('templates.requirements.remove')} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 size={15} aria-hidden="true" /></button>
    </div>)}
    {value.length < 30 && <button type="button" className="work-link-button" onClick={() => onChange([...value, emptyRequirement(value.at(-1)?.kind ?? 'material')])}><Plus size={14} aria-hidden="true" />{t('templates.requirements.add')}</button>}
  </div>;
}
export function requirementCounts(rows: readonly { kind: RequirementKind }[]): { materials: number; tools: number; notes: number } {
  return { materials: rows.filter(r => r.kind === 'material').length, tools: rows.filter(r => r.kind === 'tool').length, notes: rows.filter(r => r.kind === 'note').length };
}
/** Read-only chips, grouped by kind, used by template previews, task details and the Daily card's Bring section. */
export function RequirementChips({ rows, onRequest }: { rows: readonly TemplateRequirement[]; onRequest?(row: TemplateRequirement): void }) {
  const t = useT();
  if (!rows.length) return null;
  return <div className="requirement-chips">{REQUIREMENT_KINDS.map(kind => { const list = rows.filter(r => r.kind === kind); return list.length ? <div key={kind} className="requirement-group"><small>{t('templates.requirements.kind.' + kind)}</small>{list.map((row, i) => <span key={i} className={'requirement-chip kind-' + kind} title={row.note || undefined}>{row.name}{row.quantity ? ' · ' + row.quantity + (row.unit ? ' ' + row.unit : '') : ''}{row.note && kind === 'note' ? <small> — {row.note}</small> : null}{onRequest && kind === 'material' && <button type="button" className="work-link-button" onClick={() => onRequest(row)}>{t('work.requestMaterial')}</button>}</span>)}</div> : null; })}</div>;
}

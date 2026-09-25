import { useState } from 'react';
import { EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { FACT_KEYS, type FactKey, type Project, type ProjectFact } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { useCan } from '../../state/permissions';
import { CopyField } from '../../components/CopyField';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { runCommand } from '../work/commands';
import './styles.css';
const FIXED: FactKey[] = ['client_phone', 'address', 'gate_code', 'store_job_name', 'client_company', 'company_contact'];
type Draft = { id?: string; key: FactKey; label: string; value: string; hidden: boolean };
/** Job facts card (R-SALES-4): the things workers call to ask, one copy button each, some hidden from workers. */
export function FactsCard({ app, project }: { app: ModuleProps; project: Project }) {
  const t = useT(), office = useCan('facts.hidden'), facts = (app.snapshot.projectFacts ?? []).filter(fact => fact.projectId === project.id).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  const client = app.snapshot.clients.find(c => c.id === project.clientId), pinned = (app.snapshot.projectNotes ?? []).filter(note => note.projectId === project.id && note.pinned);
  const [editing, setEditing] = useState(false);
  const fixedValue = (key: FactKey) => facts.find(fact => fact.key === key)?.value ?? (key === 'client_phone' ? client?.phone ?? '' : key === 'address' ? project.address : '');
  const rows = FIXED.map(key => ({ key, fact: facts.find(fact => fact.key === key), value: fixedValue(key) })).filter(row => row.value);
  const custom = facts.filter(fact => fact.key === 'custom');
  return <section className="cp-facts card" aria-label={t('facts.title')}>
    <div className="task-results-heading"><span><strong>{t('facts.title')}</strong></span><button type="button" className="work-link-button" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" />{t('facts.edit')}</button></div>
    {!rows.length && !custom.length && !pinned.length && <p className="muted">{t('facts.empty')}</p>}
    {rows.map(row => <CopyField key={row.key} label={t('facts.' + row.key) + (row.fact && !row.fact.workerVisible ? ' · ' + t('facts.hiddenTag') : '')} value={row.value} />)}
    {pinned.map(note => <CopyField key={note.id} label={t('facts.paint') + ': ' + note.title} value={[note.product, note.color, note.colorCode, note.finish, note.quantity, note.store].filter(Boolean).join(' · ')} hint={note.body || undefined} />)}
    {custom.map(fact => <CopyField key={fact.id} label={fact.label + (!fact.workerVisible ? ' · ' + t('facts.hiddenTag') : '')} value={fact.value} />)}
    {editing && <FactsEditor app={app} project={project} facts={facts} office={office} onClose={() => setEditing(false)} />}
  </section>;
}
function FactsEditor({ app, project, facts, office, onClose }: { app: ModuleProps; project: Project; facts: ProjectFact[]; office: boolean; onClose(): void }) {
  const t = useT(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const initial = (): Draft[] => [...FIXED.map(key => { const fact = facts.find(item => item.key === key); return { id: fact?.id, key, label: '', value: fact?.value ?? '', hidden: fact ? !fact.workerVisible : false }; }), ...facts.filter(fact => fact.key === 'custom').map(fact => ({ id: fact.id, key: 'custom' as FactKey, label: fact.label, value: fact.value, hidden: !fact.workerVisible }))];
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const update = (index: number, patch: Partial<Draft>) => setDrafts(drafts.map((draft, i) => i === index ? { ...draft, ...patch } : draft));
  const save = async () => {
    setBusy(true);
    for (const [index, draft] of drafts.entries()) {
      const original = draft.id ? facts.find(fact => fact.id === draft.id) : undefined;
      const value = draft.value.trim(), label = draft.label.trim();
      let message: string | null = null;
      if (!value) { if (original) message = await runCommand(app, { type: 'projectFact.remove', id: original.id }); }
      else if (!original || original.value !== value || original.label !== label || (!original.workerVisible) !== draft.hidden) message = await runCommand(app, { type: 'projectFact.save', ...(original ? { id: original.id } : {}), projectId: project.id, key: draft.key, label, value, workerVisible: !draft.hidden, position: index });
      if (message) { setError(message); setBusy(false); return; }
    }
    setBusy(false); app.onSaved(t('facts.saved')); onClose();
  };
  return <WorkDialog title={t('facts.editTitle')} onClose={onClose}>
    <p className="muted">{t('facts.editHint')}</p>
    {drafts.map((draft, index) => <div key={draft.id ?? draft.key + index} className="facts-row">
      {draft.key === 'custom' ? <input placeholder={t('facts.customLabel')} value={draft.label} onChange={e => update(index, { label: e.target.value })} /> : <span className="facts-row-label">{t('facts.' + draft.key)}</span>}
      <input value={draft.value} placeholder={draft.key === 'client_phone' ? app.snapshot.clients.find(c => c.id === project.clientId)?.phone ?? '' : draft.key === 'address' ? project.address : ''} onChange={e => update(index, { value: e.target.value })} />
      {office && <label className="facts-hide"><input type="checkbox" checked={draft.hidden} onChange={e => update(index, { hidden: e.target.checked })} /><EyeOff size={14} aria-hidden="true" />{t('facts.hide')}</label>}
      {draft.key === 'custom' && <button type="button" aria-label={t('facts.remove')} onClick={() => setDrafts(drafts.filter((_, i) => i !== index))}><Trash2 size={14} aria-hidden="true" /></button>}
    </div>)}
    <button type="button" className="work-link-button" onClick={() => setDrafts([...drafts, { key: 'custom', label: '', value: '', hidden: false }])}><Plus size={14} aria-hidden="true" />{t('facts.addCustom')}</button>
    {error && <p role="alert" className="work-error">{error}</p>}
    <div className="live-actions"><button type="button" className="work-primary" disabled={busy} onClick={() => void save()}>{t('facts.save')}</button><button type="button" onClick={onClose}>{t('templates.cancel')}</button></div>
  </WorkDialog>;
}
export { FACT_KEYS };

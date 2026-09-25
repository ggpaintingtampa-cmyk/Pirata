import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { Project } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { useCan } from '../../state/permissions';
import { DateField } from '../../components/DateField';
import { Money, parseMoney } from '../../components/Money';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { runCommand } from '../work/commands';
const dollars = (cents: number | null | undefined) => cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
/** Sales details (office only): dates, the three prices and the sales note (R-SALES-1). */
export function SalesBlock({ app, project }: { app: ModuleProps; project: Project }) {
  const t = useT(), office = useCan('money.sales');
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [draft, setDraft] = useState({ startDate: project.startDate ?? '', endDate: project.endDate ?? '', sales: dollars(project.salesPriceCents), materials: dollars(project.materialsPriceCents), labor: dollars(project.laborPriceCents), note: project.salesNote ?? '' });
  if (!office) return null;
  const money = (text: string) => text.trim() ? parseMoney(text) : null;
  const save = async () => {
    const amounts = [draft.sales, draft.materials, draft.labor].map(money);
    if (amounts.some((value, i) => value === null && [draft.sales, draft.materials, draft.labor][i].trim())) { setError(t('pay.badAmount')); return; }
    setBusy(true);
    const message = await runCommand(app, { type: 'project.update', id: project.id, name: project.name, clientId: project.clientId, clientName: project.clientName, address: project.address, note: project.note, startDate: draft.startDate || null, endDate: draft.endDate || null, salesPriceCents: amounts[0], materialsPriceCents: amounts[1], laborPriceCents: amounts[2], salesNote: draft.note.trim() });
    setBusy(false); setError(message ?? '');
    if (!message) { app.onSaved(t('sales.saved')); setEditing(false); }
  };
  return <div className="cp-sales card">
    <div className="task-results-heading"><span><strong>{t('sales.title')}</strong></span><button type="button" className="work-link-button" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" />{t('sales.edit')}</button></div>
    <dl className="cp-sales-grid"><div><dt>{t('sales.start')}</dt><dd>{project.startDate ?? '—'}</dd></div><div><dt>{t('sales.end')}</dt><dd>{project.endDate ?? '—'}</dd></div><div><dt>{t('insights.salesPrice')}</dt><dd><Money cents={project.salesPriceCents} /></dd></div><div><dt>{t('insights.materialsPrice')}</dt><dd><Money cents={project.materialsPriceCents} /></dd></div><div><dt>{t('insights.laborPrice')}</dt><dd><Money cents={project.laborPriceCents} /></dd></div></dl>
    {project.salesNote && <p className="day-note">{project.salesNote}</p>}
    {editing && <WorkDialog title={t('sales.title')} onClose={() => setEditing(false)}>
      <DateField label={t('sales.start')} value={draft.startDate} onChange={startDate => setDraft({ ...draft, startDate })} /><DateField label={t('sales.end')} value={draft.endDate} onChange={endDate => setDraft({ ...draft, endDate })} />
      <label className="work-field">{t('insights.salesPrice')}<input inputMode="decimal" value={draft.sales} onChange={e => setDraft({ ...draft, sales: e.target.value })} placeholder="0.00" /></label>
      <label className="work-field">{t('insights.materialsPrice')}<input inputMode="decimal" value={draft.materials} onChange={e => setDraft({ ...draft, materials: e.target.value })} placeholder="0.00" /></label>
      <label className="work-field">{t('insights.laborPrice')}<input inputMode="decimal" value={draft.labor} onChange={e => setDraft({ ...draft, labor: e.target.value })} placeholder="0.00" /></label>
      <label className="work-field">{t('sales.note')}<textarea rows={3} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
      {error && <p role="alert" className="work-error">{error}</p>}
      <div className="live-actions"><button type="button" className="work-primary" disabled={busy} onClick={() => void save()}>{t('sales.save')}</button><button type="button" onClick={() => setEditing(false)}>{t('templates.cancel')}</button></div>
    </WorkDialog>}
  </div>;
}

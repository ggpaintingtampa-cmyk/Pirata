import { useState } from 'react';
import { laborCostCents, monthBounds, rateFor, type PayRate } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { DateField } from '../../components/DateField';
import { Money, parseMoney } from '../../components/Money';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { runCommand } from '../work/commands';
import '../hours/styles.css';
/** Owner only: hourly or daily rate per person with history; labor cost this month. */
export function PayView(app: ModuleProps) {
  const t = useT(), team = (app.snapshot.team ?? []).filter(m => !m.disabledAt), rates = app.snapshot.payRates ?? [], shifts = app.snapshot.workShifts ?? [], month = monthBounds(app.businessDate);
  const [editing, setEditing] = useState<null | { userId: string; kind: 'hourly' | 'daily'; amount: string; from: string }>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const save = async () => {
    if (!editing) return;
    const cents = parseMoney(editing.amount);
    if (cents === null) { setError(t('pay.badAmount')); return; }
    setBusy(true); const message = await runCommand(app, { type: 'payRate.set', userId: editing.userId, kind: editing.kind, amountCents: cents, effectiveFrom: editing.from }); setBusy(false); setError(message ?? '');
    if (!message) { app.onSaved(t('pay.saved')); setEditing(null); }
  };
  const remove = async (rate: PayRate) => { if (!window.confirm(t('pay.removeConfirm'))) return; const message = await runCommand(app, { type: 'payRate.remove', id: rate.id }); if (message) app.onSaved(message); };
  return <section className="work-module pay-rates" aria-label={t('shell.view.pay')}>
    <p className="muted">{t('pay.intro')}</p>
    {team.map(member => { const current = rateFor(rates, member.id, app.businessDate), history = rates.filter(r => r.userId === member.id).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)); const cost = laborCostCents(shifts, rates, { userId: member.id, from: month.from, to: month.to });
      return <article key={member.id} className="card pay-person"><div className="task-results-heading"><strong>{member.name}</strong><button type="button" className="work-link-button" onClick={() => setEditing({ userId: member.id, kind: current?.kind ?? 'hourly', amount: current ? (current.amountCents / 100).toFixed(2) : '', from: app.businessDate })}>{current ? t('pay.change') : t('pay.set')}</button></div>
        <p>{current ? <>{t('pay.' + current.kind)}: <Money cents={current.amountCents} /> <small className="muted">{t('pay.since', { date: current.effectiveFrom })}</small></> : <span className="muted">{t('pay.none')}</span>}</p>
        <p className="muted">{t('pay.monthCost')}: <Money cents={cost} /></p>
        {history.length > 1 && <ul className="pay-history">{history.map(rate => <li key={rate.id}><span>{rate.effectiveFrom} · {t('pay.' + rate.kind)} <Money cents={rate.amountCents} /></span>{rate.effectiveFrom >  app.businessDate &&  <button type="button" className="work-link-button" onClick={() => void remove(rate)}>{t('pay.remove')}</button>}</li>)}</ul>}
      </article>; })}
    {editing && <WorkDialog title={t('pay.dialog')} onClose={() => setEditing(null)}>
      <div className="task-capture-choice"><span className="task-capture-label">{t('pay.kind')}</span><div className="task-estimate-choices" role="group" aria-label={t('pay.kind')}><button type="button" aria-pressed={editing.kind === 'hourly'} onClick={() => setEditing({ ...editing, kind: 'hourly' })}>{t('pay.hourly')}</button><button type="button" aria-pressed={editing.kind === 'daily'} onClick={() => setEditing({ ...editing, kind: 'daily' })}>{t('pay.daily')}</button></div></div>
      <label className="work-field">{t('pay.amount')}<input inputMode="decimal" value={editing.amount} onChange={e => setEditing({ ...editing, amount: e.target.value })} placeholder="20.00" /></label>
      <DateField label={t('pay.from')} value={editing.from} onChange={from => setEditing({ ...editing, from })} />
      {error && <p role="alert" className="work-error">{error}</p>}
      <div className="live-actions"><button type="button" className="work-primary" disabled={busy} onClick={() => void save()}>{t('pay.save')}</button><button type="button" onClick={() => setEditing(null)}>{t('templates.cancel')}</button></div>
    </WorkDialog>}
  </section>;
}

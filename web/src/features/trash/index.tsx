import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { TrashEntry } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { runCommand } from '../work/commands';
import './styles.css';
export { DeleteButton, mayDelete } from './DeleteButton';
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Deleted items (owner and manager): every top-level deletion with a Restore control. Nothing here is ever destroyed. */
export function TrashView(app: ModuleProps) {
  const t = useT(), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const entries = app.snapshot.trash ?? [], team = app.snapshot.team ?? [];
  const name = (id: string | null) => team.find(member => member.id === id)?.name ?? '—';
  const restore = async (entry: TrashEntry) => {
    setBusy(entry.kind + entry.id);
    const failure = await runCommand(app, { type: 'record.restore', kind: entry.kind, id: entry.id });
    setBusy(''); setError(failure ?? '');
    if (!failure) app.onSaved(t('trash.restored'));
  };
  return <section className="work-module trash-view" aria-label={t('shell.view.trash')}>
    <p className="muted">{t('trash.intro')}</p>
    {!entries.length && <p className="empty-state">{t('trash.empty')}</p>}
    <ul className="trash-list">{entries.map(entry => <li key={entry.kind + entry.id} className="card trash-row">
      <div><span className="day-chip">{t('trash.kind.' + entry.kind)}</span><strong>{entry.label}</strong>{entry.detail && <small>{entry.detail}</small>}<small>{t('trash.by', { name: name(entry.deletedBy), time: timeFormat.format(entry.deletedAt) })}{entry.cascaded ? ' · ' + t('trash.cascaded', { count: entry.cascaded }) : ''}</small></div>
      <button type="button" className="work-primary" disabled={busy === entry.kind + entry.id} onClick={() => void restore(entry)}><RotateCcw size={15} aria-hidden="true" />{t('trash.restore')}</button>
    </li>)}</ul>
    {error && <p role="alert" className="work-error">{error}</p>}
  </section>;
}

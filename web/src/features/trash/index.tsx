import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { TrashEntry } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, useLocale } from '../../i18n';
import { formatDateTime } from '../../i18n/locale';
import { useRetryableCommand } from '../work/commands';
import './styles.css';
export { DeleteButton, mayDelete } from './DeleteButton';
/** Deleted items (owner and manager): every top-level deletion with a Restore control. Nothing here is ever destroyed. */
export function TrashView(app: ModuleProps) {
  const t = useT(), locale = useLocale(), [busy, setBusy] = useState(''), [error, setError] = useState(''), runner = useRetryableCommand(app);
  const entries = app.snapshot.trash ?? [], team = app.snapshot.team ?? [];
  const name = (id: string | null) => team.find(member => member.id === id)?.name ?? '—';
  const restore = async (entry: TrashEntry) => {
    setBusy(entry.kind + entry.id);
    const failure = await runner.run({ type: 'record.restore', kind: entry.kind, id: entry.id });
    setBusy(''); setError(failure ?? '');
    if (!failure) app.onSaved(t('trash.restored'));
  };
  const retry = async () => { setBusy('retry'); const failure = await runner.retry(); setBusy(''); setError(failure ?? ''); if (!failure) app.onSaved(t('trash.restored')); };
  const inTrash = new Set(entries.map(entry => entry.kind + ':' + entry.id));
  const batches = (app.snapshot.batchOperations ?? []).filter(batch => batch.kind === 'record.bulkDelete').map(batch => { const summary = JSON.parse(batch.summaryJson) as { roots: string[]; cascaded: number }; return { ...batch, roots: summary.roots, cascaded: summary.cascaded, remaining: summary.roots.filter(root => inTrash.has(root)).length }; }).filter(batch => batch.remaining > 0).sort((a, b) => b.createdAt - a.createdAt);
  const restoreBatch = async (batchId: string) => { setBusy('batch:' + batchId); const failure = await runner.run({ type: 'record.bulkRestore', batchId }); setBusy(''); setError(failure ?? ''); if (!failure) app.onSaved(t('trash.batch.restored')); };
  return <section className="work-module trash-view" aria-label={t('shell.view.trash')}>
    <p className="muted">{t('trash.intro')}</p>
    <details className="trash-matrix"><summary>{t('trash.matrix.title')}</summary><p className="muted">{t('trash.matrix.body')}</p></details>
    {batches.length > 0 && <div className="trash-batches"><h3>{t('trash.batch.title')}</h3>{batches.map(batch => <div key={batch.id} className="card trash-row"><div><strong>{t('trash.batch.summary', { roots: batch.roots.length, cascaded: batch.cascaded })}</strong><small>{t('trash.by', { name: name(batch.userId), time: formatDateTime(locale, batch.createdAt) })}{batch.remaining < batch.roots.length ? ' · ' + t('trash.batch.partly', { count: batch.roots.length - batch.remaining }) : ''}</small></div><button type="button" className="work-primary" disabled={busy === 'batch:' + batch.id} onClick={() => void restoreBatch(batch.id)}><RotateCcw size={15} aria-hidden="true" />{t('trash.batch.restoreAll', { count: batch.remaining })}</button></div>)}</div>}
    {!entries.length && <p className="empty-state">{t('trash.empty')}</p>}
    <ul className="trash-list">{entries.map(entry => <li key={entry.kind + entry.id} className="card trash-row">
      <div><span className="day-chip">{t('trash.kind.' + entry.kind)}</span><strong>{entry.label}</strong>{entry.detail && <small>{entry.detail}</small>}<small>{t('trash.by', { name: name(entry.deletedBy), time: formatDateTime(locale, entry.deletedAt) })}{entry.cascaded ? ' · ' + t('trash.cascaded', { count: entry.cascaded }) : ''}</small></div>
      <button type="button" className="work-primary" disabled={busy === entry.kind + entry.id} onClick={() => void restore(entry)}><RotateCcw size={15} aria-hidden="true" />{t('trash.restore')}</button>
    </li>)}</ul>
    {error && <p role="alert" className="work-error">{error}{runner.pending && <button type="button" className="work-link-button" disabled={busy !== ''} onClick={() => void retry()}>{t('shell.command.retryAction')}</button>}</p>}
  </section>;
}

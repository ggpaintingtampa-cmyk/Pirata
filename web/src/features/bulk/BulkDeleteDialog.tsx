// P09: the owner reviews exactly what one batch deletion touches (the server computes it) before confirming.
import { useEffect, useState } from 'react';
import type { BulkDeletePreview, TrashKind } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, useLocale } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { useServer } from '../../state/serverContext';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { CommandButton } from '../tasks-time/TaskChecklist';
import { useSelection, type Selected } from './selection';
export function BulkDeleteDialog({ app, items, onClose }: { app: ModuleProps; items: Selected[]; onClose(): void }) {
  const t = useT(), locale = useLocale(), selection = useSelection(), { store } = useServer();
  // The answer is keyed by the selection it was computed for, so a changed selection shows the loading line without a synchronous reset.
  const [answer, setAnswer] = useState<{ key: string; preview?: BulkDeletePreview; error?: string }>({ key: '' });
  const payload = items.map(({ kind, id }) => ({ kind, id })), key = JSON.stringify(payload);
  useEffect(() => {
    let active = true;
    void store.service.call<BulkDeletePreview>('trash/preview', { items: JSON.parse(key) as { kind: TrashKind; id: string }[] }).then(result => { if (active) setAnswer({ key, preview: result }); }).catch(cause => { if (active) setAnswer({ key, error: errorMessage(locale, cause) }); });
    return () => { active = false; };
  }, [key, store, locale]);
  const preview = answer.key === key ? answer.preview ?? null : null, error = answer.key === key ? answer.error ?? '' : '';
  const blocked = preview?.blocked ?? [];
  const kindLabel = (kind: TrashKind) => t('trash.kind.' + kind);
  return <WorkDialog title={t('bulk.delete.title')} onClose={onClose} className="bulk-dialog">
    <p className="muted">{t('bulk.delete.intro')}</p>
    {!preview && !error && <p role="status">{t('bulk.delete.loading')}</p>}
    {error && <p role="alert" className="work-error">{error}</p>}
    {preview && <>
      <ul className="bulk-preview">{preview.roots.map(root => <li key={root.kind + root.id} className={root.blocked ? 'is-blocked' : ''}><span className="day-chip">{kindLabel(root.kind)}</span><strong>{root.label}</strong><small>{root.blocked ?? (root.cascaded ? t('bulk.delete.cascaded', { count: root.cascaded }) : t('bulk.delete.alone'))}</small></li>)}</ul>
      {preview.dropped.length > 0 && <p className="muted">{t('bulk.delete.dropped', { count: preview.dropped.length })}</p>}
      <p><strong>{t('bulk.delete.totals', { roots: preview.totals.roots, cascaded: preview.totals.cascaded })}</strong></p>
      {blocked.length > 0 && <div className="work-error" role="alert"><p>{t('bulk.delete.blocked', { count: blocked.length })}</p><button type="button" onClick={() => { for (const item of blocked) selection?.remove(item.kind, item.id); }}>{t('bulk.delete.removeBlocked')}</button></div>}
      <p className="muted">{t('bulk.delete.restoreHint')}</p>
      <div className="live-actions">
        <CommandButton app={app} disabled={!preview.roots.length || blocked.length > 0} command={{ type: 'record.bulkDelete', items: payload, expected: preview.totals }} message={t('bulk.delete.done', { count: preview.totals.roots })} onSuccess={() => { selection?.stop(); onClose(); }}>{t('bulk.delete.confirm', { count: preview.totals.roots })}</CommandButton>
        <button type="button" onClick={onClose}>{t('templates.cancel')}</button>
      </div>
    </>}
  </WorkDialog>;
}

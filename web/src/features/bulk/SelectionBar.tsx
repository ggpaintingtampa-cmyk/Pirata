// P03/P09: the sticky bar that appears while selecting. Copy is for tasks; Move to trash is owner-only.
import { useState } from 'react';
import { Copy, Trash2, X } from 'lucide-react';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { useCan } from '../../state/permissions';
import { useSelection } from './selection';
import { BulkCopyDialog } from './BulkCopyDialog';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import './styles.css';
export function SelectionBar({ app }: { app: ModuleProps }) {
  const t = useT(), selection = useSelection(), owner = useCan('records.bulkDelete'), [dialog, setDialog] = useState<'copy' | 'delete' | null>(null);
  if (!selection?.active) return null;
  const tasksOnly = selection.items.length > 0 && selection.items.every(item => item.kind === 'task');
  return <>
    <div className="bulk-bar" role="region" aria-label={t('bulk.bar')}>
      <span className="bulk-count">{t('bulk.count', { count: selection.items.length })}</span>
      <button type="button" disabled={!tasksOnly} title={selection.items.length && !tasksOnly ? t('bulk.copy.tasksOnly') : undefined} onClick={() => setDialog('copy')}><Copy size={15} aria-hidden="true" />{t('bulk.copy.action')}</button>
      {owner && <button type="button" disabled={!selection.items.length} onClick={() => setDialog('delete')}><Trash2 size={15} aria-hidden="true" />{t('bulk.delete.action')}</button>}
      <button type="button" onClick={() => selection.stop()}><X size={15} aria-hidden="true" />{t('bulk.cancel')}</button>
    </div>
    {dialog === 'copy' && <BulkCopyDialog app={app} taskIds={selection.items.map(item => item.id)} onClose={() => setDialog(null)} />}
    {dialog === 'delete' && <BulkDeleteDialog app={app} items={selection.items} onClose={() => setDialog(null)} />}
  </>;
}

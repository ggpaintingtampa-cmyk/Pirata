import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { can, type TrashKind } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { runCommand } from '../work/commands';
import { useConfirm } from '../../components/ConfirmDialog';
import './styles.css';
/** Whether to show a Delete control. Mirrors assertMayDelete in server/src/modules/trash; the server remains the guarantee. */
export function mayDelete(app: ModuleProps, kind: TrashKind, row: Record<string, unknown>): boolean {
  const role = app.snapshot.currentUser?.role, me = app.snapshot.currentUser?.id;
  if (kind === 'expense') return can(role, 'money.costs');
  if (kind === 'taskTemplate' || kind === 'projectTemplate') return can(role, 'template.manage');
  if (can(role, 'records.delete')) return true;
  const mine = (field: string) => !!me && row[field] === me;
  switch (kind) {
    case 'project': return mine('salesRepId') && row.status === 'draft';
    case 'task': { const project = app.snapshot.projects.find(p => p.id === row.projectId); return !!project && !!me && project.salesRepId === me && project.status === 'draft'; }
    case 'materialRequest': return mine('createdBy') && row.receivedAt == null;
    case 'toolSignOut': return mine('takenBy') && row.returnedAt == null;
    case 'question': return mine('askedBy') && row.answeredAt == null;
    case 'shift': return mine('userId') && row.status === 'submitted';
    case 'equipmentReport': return mine('reportedBy') && row.resolvedAt == null;
    case 'projectNote': return mine('createdBy');
    default: return false;
  }
}
/** One "Delete" control for any record: confirms, moves the record to Deleted items and reports the outcome. */
export function DeleteButton({ app, kind, id, label, className = '', onDone, children }: { app: ModuleProps; kind: TrashKind; id: string; label: string; className?: string; onDone?(): void; children?: ReactNode }) {
  const t = useT(), [busy, setBusy] = useState(false), [error, setError] = useState(''), { confirm, dialog } = useConfirm();
  const remove = async () => {
    if (!await confirm({ title: t('trash.delete'), message: t('trash.confirm', { label }), confirmLabel: t('trash.delete'), danger: true })) return;
    setBusy(true);
    const failure = await runCommand(app, { type: 'record.delete', kind, id });
    setBusy(false);
    if (failure) { setError(failure); return; }
    setError(''); app.onSaved(t('trash.deleted')); onDone?.();
  };
  return <>
    <button type="button" className={'delete-button ' + className} disabled={busy} onClick={() => void remove()}><Trash2 size={15} aria-hidden="true" />{children ?? t('trash.delete')}</button>
    {error && <p role="alert" className="work-error">{error}</p>}
    {dialog}
  </>;
}

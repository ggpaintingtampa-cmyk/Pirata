import { useState } from 'react';
import { Check, Send, Undo2 } from 'lucide-react';
import { projectLabel, type Project, type Task } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { useCan } from '../../state/permissions';
import { runCommand } from '../work/commands';
/** Derived lifecycle label (draft / sold / scheduled / partial / assigned / completed). */
export function ProjectStatusChip({ project, tasks }: { project: Project; tasks: readonly Task[] }) {
  const t = useT(), label = projectLabel(project, tasks);
  return <span className={'cp-badge cp-status-' + label}>{t('insights.label.' + label)}</span>;
}
/** The review gate (R-SALES-3): draft → sold (office) → scheduled or back to draft with a note (reviewers). */
export function ProjectLifecycle({ app, project }: { app: ModuleProps; project: Project }) {
  const t = useT(), office = useCan('money.sales'), reviewer = useCan('project.review');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sendingBack, setSendingBack] = useState(false), [note, setNote] = useState('');
  const run = async (status: Project['status'], reason?: string) => { setBusy(true); const message = await runCommand(app, { type: 'project.setStatus', id: project.id, status, ...(reason ? { note: reason } : {}) }); setBusy(false); setError(message ?? ''); if (!message) { setSendingBack(false); app.onSaved(t('sales.statusSaved')); } };
  if (project.status !== 'draft' && project.status !== 'sold') return null;
  return <div className="cp-lifecycle card">
    {project.status === 'draft' && <>{project.reviewNote && <p className="cp-lifecycle-note"><Undo2 size={15} aria-hidden="true" />{t('sales.sentBack', { note: project.reviewNote })}</p>}<p className="muted">{t('sales.draftHint')}</p>{office && <button type="button" className="work-primary" disabled={busy} onClick={() => void run('sold')}><Send size={16} aria-hidden="true" />{t('sales.sendToReview')}</button>}</>}
    {project.status === 'sold' && (reviewer ? <><p className="muted">{t('sales.reviewHint')}</p><div className="live-actions"><button type="button" className="work-primary" disabled={busy} onClick={() => void run('scheduled')}><Check size={16} aria-hidden="true" />{t('sales.approve')}</button><button type="button" disabled={busy} onClick={() => setSendingBack(open => !open)}>{t('sales.sendBack')}</button></div>
      {sendingBack && <div className="live-actions"><input placeholder={t('sales.sendBackNote')} value={note} onChange={e => setNote(e.target.value)} /><button type="button" disabled={busy || !note.trim()} onClick={() => void run('draft', note.trim())}>{t('sales.sendBackConfirm')}</button></div>}</> : <p className="muted">{t('sales.waitingReview')}</p>)}
    {error && <p role="alert" className="work-error">{error}</p>}
  </div>;
}

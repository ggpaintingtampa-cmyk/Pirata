import { useState } from 'react';
import { AlertTriangle, Wrench } from 'lucide-react';
import type { Equipment } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, useLocale } from '../../i18n';
import { formatDateTime } from '../../i18n/locale';
import { TranslatedText } from '../../components/TranslatedText';
import { useCan } from '../../state/permissions';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { runCommand } from '../work/commands';
import { SignOutDialog } from './SignOutDialog';
import '../materials/styles.css';
import { DeleteButton, mayDelete } from '../trash';
/** Current holder, broken state and actions for one tool. Used on the Tools screen and inside the equipment details. */
export function ToolStatus({ app, tool, compact = false }: { app: ModuleProps; tool: Equipment; compact?: boolean }) {
  const t = useT(), locale = useLocale(), admin = useCan('equipment.admin'), office = useCan('plan.others'), me = app.snapshot.currentUser?.id;
  const [dialog, setDialog] = useState<null | 'take' | 'report'>(null), [body, setBody] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [history, setHistory] = useState(false);
  const team = app.snapshot.team ?? [], name = (id: string | null | undefined) => team.find(m => m.id === id)?.name ?? '—', project = (id: string | null | undefined) => app.snapshot.projects.find(p => p.id === id)?.name;
  const signOuts = (app.snapshot.toolSignOuts ?? []).filter(row => row.equipmentId === tool.id).sort((a, b) => b.takenAt - a.takenAt), out = signOuts.find(row => row.returnedAt === null);
  const reports = (app.snapshot.equipmentReports ?? []).filter(row => row.equipmentId === tool.id).sort((a, b) => b.createdAt - a.createdAt), openReport = reports.find(row => row.resolvedAt === null);
  const cleanings = (app.snapshot.cleanupObligations ?? []).filter(row => row.equipmentId === tool.id && row.completedAt).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const run = async (command: Parameters<typeof runCommand>[1], message?: string) => { setBusy(true); const failure = await runCommand(app, command); setBusy(false); setError(failure ?? ''); if (!failure) { if (message) app.onSaved(message); setDialog(null); setBody(''); } return !failure; };
  const returnTool = async () => { if (!out || !window.confirm(t('tools.returnConfirm', { name: tool.name }))) return false; return run({ type: 'tool.return', id: out.id, returnedAt: null }, t('tools.dialog.returned')); };
  return <div className={'tool-row' + (openReport ? ' is-broken' : '') + (out ? ' is-out' : '')}>
    <div className="tool-status"><Wrench size={15} aria-hidden="true" /><strong>{tool.name}</strong>{tool.requiresSignOut ? <span className="day-chip">{t('tools.needsSignOut')}</span> : null}{openReport && <span className="day-chip tool-broken"><AlertTriangle size={13} aria-hidden="true" />{t('tools.broken', { body: openReport.body })}</span>}</div>
    <p className="muted">{out ? t('tools.with', { name: name(out.takenBy), project: project(out.projectId) ? t('tools.at', { project: project(out.projectId) ?? '' }) : '', time: formatDateTime(locale, out.takenAt) }) : t('tools.inShop')}</p>
    <div className="live-actions">
      {!out && <button type="button" className="work-primary" disabled={busy} onClick={() => setDialog('take')}>{t('tools.take')}</button>}
      {out && (out.takenBy === me || office) && <button type="button" className="work-primary" disabled={busy} onClick={() => void returnTool()}>{t('tools.return')}</button>}
      {out && out.takenBy !== me && <button type="button" disabled={busy} onClick={() => void returnTool().then(ok => { if (ok) setDialog('take'); })}>{t('tools.returnTake')}</button>}
      <button type="button" disabled={busy} onClick={() => setDialog('report')}>{t('tools.reportBroken')}</button>
      {openReport && admin && <button type="button" disabled={busy} onClick={() => void run({ type: 'equipment.resolveReport', id: openReport.id })}>{t('tools.resolve')}</button>}
      {openReport && mayDelete(app, 'equipmentReport', openReport as unknown as Record<string, unknown>) && <DeleteButton app={app} kind="equipmentReport" id={openReport.id} label={openReport.body.slice(0, 40)} />}
      {admin && !compact && <button type="button" disabled={busy} onClick={() => void run({ type: 'equipment.setSignOutRequired', id: tool.id, required: !tool.requiresSignOut })}>{tool.requiresSignOut ? t('tools.noSignOut') : t('tools.needsSignOut')}</button>}
      {!compact && <button type="button" className="work-link-button" onClick={() => setHistory(open => !open)}>{t('tools.history')}</button>}
    </div>
    {history && <ul className="tool-history">{signOuts.slice(0, 10).map(row => <li key={row.id}>{mayDelete(app, 'toolSignOut', row as unknown as Record<string, unknown>) && <DeleteButton app={app} kind="toolSignOut" id={row.id} label={tool.name + ' · ' + formatDateTime(locale, row.takenAt)} className="work-link-button" />}{t('tools.taken', { name: name(row.takenBy), time: formatDateTime(locale, row.takenAt) })}{project(row.projectId) ? ' · ' + project(row.projectId) : ''}{row.returnedAt ? ' — ' + t('tools.returned', { name: name(row.returnedBy), time: formatDateTime(locale, row.returnedAt) }) : ''}</li>)}{cleanings.slice(0, 5).map(row => <li key={row.id}>{t('tools.cleanedBy', { name: name(row.completedBy), time: formatDateTime(locale, row.completedAt ?? 0) })}</li>)}{reports.slice(0, 5).map(row => <li key={row.id}>{t('tools.reportedBy', { name: name(row.reportedBy), time: formatDateTime(locale, row.createdAt) })}: <TranslatedText kind="equipmentReport" id={row.id} field="body" text={row.body} compact />{row.resolvedAt ? ' — ' + t('tools.resolvedBy', { name: name(row.resolvedBy) }) : ''}</li>)}</ul>}
    {error && <p role="alert" className="work-error">{error}</p>}
    {dialog === 'take' && <SignOutDialog app={app} equipmentId={tool.id} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />}
    {dialog === 'report' && <WorkDialog title={t('tools.report.title') + ' · ' + tool.name} onClose={() => setDialog(null)}><label className="work-field">{t('tools.report.body')}<textarea rows={3} value={body} onChange={e => setBody(e.target.value)} /></label><div className="live-actions"><button type="button" className="work-primary" disabled={busy || !body.trim()} onClick={() => void run({ type: 'equipment.reportBroken', id: tool.id, body: body.trim(), attachmentId: null }, t('tools.report.saved'))}>{t('tools.report.save')}</button><button type="button" onClick={() => setDialog(null)}>{t('templates.cancel')}</button></div></WorkDialog>}
  </div>;
}
/** Tools screen: the sign-out board and every tool (R-TOOL-1..3). */
export function ToolsView(app: ModuleProps) {
  const t = useT(), [tab, setTab] = useState<'board' | 'all'>('board');
  const tools = app.snapshot.equipment.filter(tool => tool.archivedAt === null), board = tools.filter(tool => tool.requiresSignOut);
  const list = tab === 'board' ? board : tools;
  return <section className="work-module tools-view" aria-label={t('shell.view.tools')}>
    <div className="cp-tabs" role="group"><button type="button" aria-pressed={tab === 'board'} onClick={() => setTab('board')}>{t('tools.board')} <span>{board.length}</span></button><button type="button" aria-pressed={tab === 'all'} onClick={() => setTab('all')}>{t('tools.all')} <span>{tools.length}</span></button></div>
    {!list.length && <p className="empty-state">{tab === 'board' ? t('tools.noneBoard') : t('tools.noneAll')}</p>}
    <ul className="tool-list">{list.map(tool => <li key={tool.id}><ToolStatus app={app} tool={tool} /></li>)}</ul>
  </section>;
}

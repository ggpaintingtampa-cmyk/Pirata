import { useState } from 'react';
import { DeleteButton, mayDelete } from '../trash';
import { ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import { monthBounds, presence, weekBounds, type WorkShift } from '@pirata/contracts/index';
import type { BusinessCommand } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, tx } from '../../i18n';
import { useCan } from '../../state/permissions';
import { DateField, addDays } from '../../components/DateField';
import { useRetryableCommand } from '../work/commands';
import { ShiftDialog } from './ShiftDialog';
import { prefillDate } from './defaults';
import { useConfirm } from '../../components/ConfirmDialog';
import './styles.css';
const fmt = (minutes: number) => (minutes / 60).toFixed(minutes % 60 ? 2 : 0);
const clock = (minute: number | null) => minute === null ? '' : String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
function ShiftRow({ app, shift, onEdit }: { app: ModuleProps; shift: WorkShift; onEdit(shift: WorkShift): void }) {
  const t = useT(), approver = useCan('shift.approve'), me = app.snapshot.currentUser?.id, [busy, setBusy] = useState(false), [rejecting, setRejecting] = useState(false), [note, setNote] = useState(''), { confirm, dialog } = useConfirm(), runner = useRetryableCommand(app);
  const project = app.snapshot.projects.find(p => p.id === shift.projectId)?.name ?? '—', person = app.snapshot.team?.find(m => m.id === shift.userId)?.name ?? '—';
  const run = async (command: BusinessCommand) => { setBusy(true); const message = await runner.run(command); setBusy(false); if (message) app.onSaved(message); else setRejecting(false); };
  const retry = async () => { setBusy(true); const message = await runner.retry(); setBusy(false); if (message) app.onSaved(message); };
  const editable = approver || (shift.userId === me && shift.status === 'submitted');
  return <li className={'shift-row status-' + shift.status}>
    <div className="shift-main"><strong>{shift.date}</strong><span>{project}</span>{shift.userId !== me && <span className="day-chip">{person}</span>}<span>{shift.kind === 'hours' ? clock(shift.startMinute) + '–' + clock(shift.endMinute) + (shift.breakMinutes ? ' · −' + shift.breakMinutes + 'm' : '') : (shift.daysMinor ?? 0) / 100 + ' ' + tx('d')}</span><strong>{t('hours.total', { hours: fmt(shift.minutes) })}</strong></div>
    <div className="shift-meta"><span className={'badge badge-' + (shift.status === 'approved' ? 'done' : shift.status === 'rejected' ? 'blocked' : 'open')}>{t('hours.status.' + shift.status)}</span>{shift.status === 'rejected' && shift.decisionNote && <small>{t('hours.rejected', { note: shift.decisionNote })}</small>}{shift.note && <small>{shift.note}</small>}</div>
    <div className="live-actions">{mayDelete(app, 'shift', shift as unknown as Record<string, unknown>) && <DeleteButton app={app} kind="shift" id={shift.id} label={shift.date + ' · ' + project} />}{approver && shift.status !== 'approved' && <button type="button" className="work-primary" disabled={busy} onClick={() => void run({ type: 'shift.approve', id: shift.id })}>{t('hours.approve')}</button>}{approver && shift.status !== 'rejected' && <button type="button" disabled={busy} onClick={() => setRejecting(open => !open)}>{t('hours.reject')}</button>}{editable && <button type="button" onClick={() => onEdit(shift)}>{t('hours.edit')}</button>}{editable && <button type="button" disabled={busy} onClick={() => { void confirm({ title: t('hours.remove'), message: t('hours.removeConfirm'), confirmLabel: t('hours.remove'), danger: true }).then(ok => { if (ok) void run({ type: 'shift.remove', id: shift.id }); }); }}>{t('hours.remove')}</button>}</div>{dialog}
    {runner.pending && <div className="live-actions"><span role="alert" className="work-error">{t('shell.command.unconfirmed')}</span><button type="button" disabled={busy} onClick={() => void retry()}>{t('shell.command.retryAction')}</button></div>}
    {rejecting && <div className="live-actions"><input placeholder={t('hours.rejectNote')} value={note} onChange={e => setNote(e.target.value)} /><button type="button" disabled={busy || !note.trim()} onClick={() => void run({ type: 'shift.reject', id: shift.id, note: note.trim() })}>{t('hours.reject')}</button></div>}
  </li>;
}
export function HoursView(app: ModuleProps & { date?: string }) {
  const t = useT(), office = useCan('shift.approve'), me = app.snapshot.currentUser?.id ?? '';
  const [tab, setTab] = useState<'mine' | 'team'>('mine'), [anchor, setAnchor] = useState(prefillDate(app.date, app.businessDate)), [dialog, setDialog] = useState<null | { shift?: WorkShift; userId?: string; projectId?: string; date?: string }>(null);
  const shifts = app.snapshot.workShifts ?? [], team = (app.snapshot.team ?? []).filter(m => !m.disabledAt), projects = app.snapshot.projects.filter(p => p.status !== 'completed' && p.status !== 'draft');
  const week = weekBounds(anchor), month = monthBounds(anchor);
  const inRange = (shift: WorkShift, range: { from: string; to: string }) => shift.date >= range.from && shift.date <= range.to;
  const mine = shifts.filter(s => s.userId === me && inRange(s, week)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const minutesOf = (rows: WorkShift[], approvedOnly = false) => rows.filter(s => s.status !== 'rejected' && (!approvedOnly || s.status === 'approved')).reduce((sum, s) => sum + s.minutes, 0);
  const pending = shifts.filter(s => s.status === 'submitted').sort((a, b) => a.date.localeCompare(b.date));
  const dayShifts = shifts.filter(s => s.date === anchor);
  const gridProjects = projects.filter(p => dayShifts.some(s => s.projectId === p.id) || presence(app.snapshot, anchor, p.id).length > 0);
  const exportHref = `/api/v1/export/shifts.csv?from=${tab === 'team' ? month.from : week.from}&to=${tab === 'team' ? month.to : week.to}`;
  return <section className="work-module hours-view" aria-label={t('shell.view.hours')}>
    {office && <div className="cp-tabs hours-tabs" role="group"><button type="button" aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>{t('hours.mine')}</button><button type="button" aria-pressed={tab === 'team'} onClick={() => setTab('team')}>{t('hours.team')}</button></div>}
    <div className="day-date"><button type="button" aria-label={t('work.previousDay')} onClick={() => setAnchor(addDays(anchor, tab === 'team' ? -1 : -7))}><ChevronLeft size={18} aria-hidden="true" /></button><DateField label={t('work.date')} value={anchor} onChange={setAnchor} /><button type="button" aria-label={t('work.nextDay')} onClick={() => setAnchor(addDays(anchor, tab === 'team' ? 1 : 7))}><ChevronRight size={18} aria-hidden="true" /></button><a className="work-link-button" href={exportHref} download><Download size={15} aria-hidden="true" />{t('hours.export')}</a></div>
    {tab === 'mine' && <>
      <div className="task-results-heading"><span>{t('hours.week', { from: week.from })} · {t('hours.total', { hours: fmt(minutesOf(mine)) })}</span><button type="button" className="work-primary" onClick={() => setDialog({})}><Plus size={16} aria-hidden="true" />{t('hours.add')}</button></div>
      {!mine.length && <p className="empty-state">{t('hours.none')}</p>}
      <ul className="shift-list">{mine.map(shift => <ShiftRow key={shift.id} app={app} shift={shift} onEdit={s => setDialog({ shift: s })} />)}</ul>
    </>}
    {tab === 'team' && office && <>
      <h3>{t('hours.pending')} <span className="directory-count">{pending.length}</span></h3>
      {!pending.length && <p className="empty-state">{t('hours.nonePending')}</p>}
      <ul className="shift-list">{pending.map(shift => <ShiftRow key={shift.id} app={app} shift={shift} onEdit={s => setDialog({ shift: s })} />)}</ul>
      <h3>{t('hours.grid', { date: anchor })}</h3><p className="muted">{t('hours.gridHint')}</p>
      <div className="hours-grid-wrap"><table className="hours-grid"><thead><tr><th>{t('hours.person')}</th>{gridProjects.map(p => <th key={p.id}>{p.name}</th>)}<th>+</th></tr></thead><tbody>{team.map(member => <tr key={member.id}><th>{member.name}</th>{gridProjects.map(p => { const cell = dayShifts.filter(s => s.userId === member.id && s.projectId === p.id); const minutes = minutesOf(cell); return <td key={p.id}><button type="button" className={cell.some(s => s.status === 'submitted') ? 'is-pending' : minutes ? 'is-filled' : ''} aria-label={t('hours.enterFor', { name: member.name })} onClick={() => cell[0] ? setDialog({ shift: cell[0] }) : setDialog({ userId: member.id, projectId: p.id, date: anchor })}>{minutes ? fmt(minutes) : '·'}</button></td>; })}<td><button type="button" aria-label={t('hours.enterFor', { name: member.name })} onClick={() => setDialog({ userId: member.id, date: anchor })}><Plus size={14} aria-hidden="true" /></button></td></tr>)}</tbody></table></div>
      <h3>{t('hours.summaryWeek')} · {t('hours.week', { from: week.from })}</h3>
      <table className="hours-summary"><tbody>{team.map(member => { const rows = shifts.filter(s => s.userId === member.id); return <tr key={member.id}><th>{member.name}</th><td>{t('hours.total', { hours: fmt(minutesOf(rows.filter(s => inRange(s, week)), true)) })}</td><td className="muted">{t('hours.summaryMonth')}: {t('hours.total', { hours: fmt(minutesOf(rows.filter(s => inRange(s, month)), true)) })}</td></tr>; })}</tbody></table>
      <h3>{t('hours.byProject')} · {t('hours.summaryMonth')}</h3>
      <table className="hours-summary"><tbody>{projects.map(p => <tr key={p.id}><th>{p.name}</th><td>{t('hours.total', { hours: fmt(minutesOf(shifts.filter(s => s.projectId === p.id && inRange(s, month)), true)) })}</td></tr>)}</tbody></table>
    </>}
    {dialog && <ShiftDialog app={app} shift={dialog.shift} userId={dialog.userId} projectId={dialog.projectId} date={dialog.date} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />}
  </section>;
}

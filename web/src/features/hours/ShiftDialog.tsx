import { useState } from 'react';
import { DAY_UNITS, shiftMinutes, type WorkShift } from '@pirata/contracts/index';
import type { RegisteredDialogProps } from '../../live/dialogRegistry';
import { useT, useLocale } from '../../i18n';
import { formatCalendarDate } from '../../i18n/locale';
import { useCan } from '../../state/permissions';
import { DateField } from '../../components/DateField';
import { TimeField } from '../../components/TimeField';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { useRetryableCommand } from '../work/commands';
import { prefillDate, preselectProject } from './defaults';
type DayUnit = (typeof DAY_UNITS)[number];
/** Submit my hours (worker) or enter hours for anyone (manager/owner, approved at once); also edits an existing entry.
 *  P04: opened from a calendar day with that date prefilled; person and amount come first, the project follows presence. */
export function ShiftDialog({ app, projectId, onClose, onDone, shift, userId, date }: RegisteredDialogProps & { shift?: WorkShift }) {
  const t = useT(), locale = useLocale(), canOthers = useCan('shift.enterForOthers'), me = app.snapshot.currentUser?.id ?? '', runner = useRetryableCommand(app);
  const projects = app.snapshot.projects.filter(p => p.status !== 'completed' && p.status !== 'draft'), team = (app.snapshot.team ?? []).filter(m => !m.disabledAt);
  const [person, setPerson] = useState(shift?.userId ?? userId ?? me);
  const [day, setDay] = useState(shift?.date ?? prefillDate(date, app.businessDate));
  const [chosenProject, setChosenProject] = useState<string | null>(shift?.projectId ?? projectId ?? null);
  const project = chosenProject ?? preselectProject(app.snapshot, person, day);
  const [kind, setKind] = useState<'hours' | 'day'>(shift?.kind ?? 'hours');
  const [start, setStart] = useState<number | null>(shift?.startMinute ?? 480), [end, setEnd] = useState<number | null>(shift?.endMinute ?? 990), [breakMinutes, setBreak] = useState(shift?.breakMinutes ?? 30);
  const [days, setDays] = useState<DayUnit>((DAY_UNITS.find(unit => unit === shift?.daysMinor) ?? 100) as DayUnit), [note, setNote] = useState(shift?.note ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const fields = { projectId: project, date: day, kind, startMinute: kind === 'hours' ? start : null, endMinute: kind === 'hours' ? end : null, breakMinutes: kind === 'hours' ? breakMinutes : 0, daysMinor: (kind === 'day' ? days : null) as DayUnit | null, note };
  const minutes = shiftMinutes(fields);
  const finish = (message: string | null) => { setBusy(false); setError(message ?? ''); if (!message) { app.onSaved(t('hours.dialog.saved')); onDone(); } };
  const save = async () => {
    if (!project) { setError(t('hours.dialog.needProject')); return; }
    if (kind === 'hours' && (start === null || end === null || minutes < 1)) { setError(t('hours.dialog.needTimes')); return; }
    if (kind === 'day' && minutes < 1) { setError(t('hours.dialog.needDays')); return; }
    setBusy(true);
    const command = shift ? { type: 'shift.update' as const, id: shift.id, ...fields } : person !== me && canOthers ? { type: 'shift.enter' as const, userId: person, ...fields } : { type: 'shift.submit' as const, ...fields };
    finish(await runner.run(command));
  };
  const retry = async () => { setBusy(true); finish(await runner.retry()); };
  return <WorkDialog title={t('hours.dialog.title') + ' · ' + formatCalendarDate(locale, day)} onClose={onClose}>
    {canOthers && !shift && <label className="work-field">{t('hours.dialog.person')}<select value={person} onChange={e => setPerson(e.target.value)}>{team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
    <div className="task-capture-choice"><span className="task-capture-label">{t('hours.dialog.kind')}</span><div className="task-estimate-choices" role="group" aria-label={t('hours.dialog.kind')}><button type="button" aria-pressed={kind === 'hours'} onClick={() => setKind('hours')}>{t('hours.dialog.hours')}</button><button type="button" aria-pressed={kind === 'day'} onClick={() => setKind('day')}>{t('hours.dialog.day')}</button></div></div>
    {kind === 'hours' ? <div className="shift-times"><TimeField label={t('hours.dialog.in')} value={start} onChange={setStart} step={300} /><TimeField label={t('hours.dialog.out')} value={end} onChange={setEnd} step={300} /><label className="work-field">{t('hours.dialog.break')}<input type="number" min={0} max={600} step={5} value={breakMinutes} onChange={e => setBreak(Math.max(0, Number(e.target.value) || 0))} /></label></div>
      : <div className="task-capture-choice"><span className="task-capture-label">{t('hours.dialog.days')}</span><div className="task-estimate-choices" role="group" aria-label={t('hours.dialog.days')}>{DAY_UNITS.map(unit => <button key={unit} type="button" aria-pressed={days === unit} onClick={() => setDays(unit)}>{unit / 100}</button>)}</div><p className="muted">{t('hours.dialog.dayHint')}</p></div>}
    <p className="muted">{t('hours.total', { hours: (minutes / 60).toFixed(2) })}</p>
    <label className="work-field">{t('hours.dialog.project')}<select value={project} onChange={e => setChosenProject(e.target.value)}>{!projects.length && <option value="">{t('hours.noProjects')}</option>}{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <DateField label={t('hours.dialog.date')} value={day} onChange={setDay} />
    <label className="work-field">{t('hours.dialog.note')}<textarea value={note} onChange={e => setNote(e.target.value)} rows={2} /></label>
    {error && <p role="alert" className="work-error">{error}{runner.pending && <button type="button" className="work-link-button" disabled={busy} onClick={() => void retry()}>{t('shell.command.retryAction')}</button>}</p>}
    <div className="live-actions"><button type="button" className="work-primary" disabled={busy || minutes < 1} onClick={() => void save()}>{t('hours.dialog.save')}</button><button type="button" onClick={onClose}>{t('templates.cancel')}</button></div>
  </WorkDialog>;
}

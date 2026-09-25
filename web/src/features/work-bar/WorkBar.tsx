import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Pause, Play, Timer } from 'lucide-react';
import { dayItems } from '@pirata/contracts/index';
import { entryMilliseconds, formatClock, formatDuration } from '@pirata/domain/lib/time';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { useServerNow } from '../tasks-time/useServerNow';
import { actualMilliseconds } from '../tasks-time/time';
import { runCommand } from '../work/commands';
import './styles.css';
/** Sticky timer bar on every page (FUTURE-IMPLEMENTATIONS §1, option a): pause banks the interval and ends the session. */
export function WorkBar({ app, onOpenTask }: { app: ModuleProps; onOpenTask(id: string): void }) {
  const t = useT(), now = useServerNow(app.snapshot), [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const me = app.snapshot.currentUser?.id ?? '', timer = app.snapshot.runningTimer, tasks = app.snapshot.tasks;
  const task = timer ? tasks.find(item => item.id === timer.taskId) : undefined;
  const suggestion = !timer ? dayItems(app.snapshot, app.businessDate, { kind: 'person', userId: me }).map(row => tasks.find(item => item.id === row.taskId)).find(item => item && item.status === 'open' && !item.archivedAt) ?? tasks.find(item => item.status === 'open' && !item.archivedAt && item.assigneeId === me) : undefined;
  const badClock = Boolean(timer && now < timer.startedAt);
  const session = timer && !badClock ? now - timer.startedAt : 0;
  const mine = task ? app.snapshot.timeEntries.filter(entry => entry.taskId === task.id && entry.userId === me).reduce((sum, entry) => sum + entryMilliseconds(entry), 0) + session : 0;
  const team = task ? actualMilliseconds(app.snapshot, task.id, now) : null;
  const run = async (command: Parameters<typeof runCommand>[1], confirmText?: string) => {
    if (busy || (confirmText && !window.confirm(confirmText))) return;
    setBusy(true); setError((await runCommand(app, command)) ?? ''); setBusy(false);
  };
  if (!timer && !suggestion) return <div className="work-bar work-bar-idle" aria-label={t('workbar.label')}><span className="work-bar-pill"><Timer size={16} aria-hidden="true" />{t('workbar.noTimer')}</span></div>;
  return <div className={'work-bar' + (expanded ? ' is-expanded' : '')} aria-label={t('workbar.label')}>
    <button type="button" className="work-bar-pill" aria-expanded={expanded} onClick={() => setExpanded(open => !open)}>
      <Timer size={16} aria-hidden="true" /><span className="work-bar-title">{task ? task.title : suggestion?.title}</span>
      <strong className="work-bar-clock">{timer ? (badClock ? t('workbar.badClock') : formatClock(session)) : t('workbar.start')}</strong>
      {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
    </button>
    {expanded && <div className="work-bar-details">
      {task && <div className="work-bar-totals"><span>{t('workbar.mine')}: <strong>{formatDuration(mine)}</strong></span><span>{t('workbar.team')}: <strong>{team === null ? '—' : formatDuration(team)}</strong></span></div>}
      <div className="work-bar-actions">
        {!timer && suggestion && <button type="button" className="work-primary" disabled={busy} onClick={() => void run({ type: 'timer.start', taskId: suggestion.id })}><Play size={16} aria-hidden="true" />{t('workbar.start')}</button>}
        {timer && <button type="button" disabled={busy || badClock} onClick={() => void run({ type: 'timer.pause', expectedSessionId: timer.sessionId }, t('workbar.pauseConfirm'))}><Pause size={16} aria-hidden="true" />{t('workbar.pause')}</button>}
        {timer && task && <button type="button" disabled={busy || badClock} onClick={() => void run({ type: 'task.setStatus', id: task.id, status: 'done', expectedSessionId: timer.sessionId }, t('workbar.completeConfirm', { title: task.title }))}><Check size={16} aria-hidden="true" />{t('workbar.complete')}</button>}
        <button type="button" onClick={() => onOpenTask((task ?? suggestion)!.id)}>{t('workbar.open')}</button>
      </div>
      {error && <p role="alert" className="work-error">{error}</p>}
    </div>}
  </div>;
}

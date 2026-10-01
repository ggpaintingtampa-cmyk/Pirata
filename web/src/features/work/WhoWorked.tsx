// P08: a compact "Who worked" block above the day's tasks, from the same persisted hours entries as the Hours page.
// Workers only receive their own entries from the server, so the block is titled "Your hours" for them. No pay data here.
import { Clock3 } from 'lucide-react';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, useLocale } from '../../i18n';
import { formatHours } from '../../i18n/locale';
import { useCan } from '../../state/permissions';
import { whoWorked } from './dayList';
export function WhoWorked({ app, date, onOpenHours }: { app: ModuleProps; date: string; onOpenHours?(date: string): void }) {
  const t = useT(), locale = useLocale(), office = useCan('shift.approve');
  const rows = whoWorked(app.snapshot, date);
  return <section className="who-worked" aria-label={office ? t('work.hours.team') : t('work.hours.mine')}>
    <div className="task-results-heading"><span><Clock3 size={14} aria-hidden="true" /> {office ? t('work.hours.team') : t('work.hours.mine')}</span>{onOpenHours && <button type="button" className="work-link-button" onClick={() => onOpenHours(date)}>{t('work.hours.open')}</button>}</div>
    {rows.length ? <ul className="who-worked-list">{rows.map(row => <li key={row.userId}>
      <strong>{row.name}</strong>
      <span className="who-worked-total">{row.daysMinor ? t('work.hours.days', { days: formatHours(locale, row.daysMinor * 60 / 100), hours: formatHours(locale, row.minutes) }) : t('work.hours.total', { hours: formatHours(locale, row.minutes) })}</span>
      <span className="who-worked-badges">{row.approved > 0 && <span className="badge badge-done">{t('work.hours.approved', { count: row.approved })}</span>}{row.submitted > 0 && <span className="badge badge-open">{t('work.hours.submitted', { count: row.submitted })}</span>}</span>
    </li>)}</ul> : <p className="muted who-worked-empty">{t('work.hours.none')}</p>}
    {rows.length > 0 && <p className="muted who-worked-note">{t('work.hours.note')}</p>}
  </section>;
}

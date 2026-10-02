import { useState } from 'react';
import { businessDate } from '@pirata/domain/lib/dates';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { JournalDialog } from './JournalDialog';

export function JournalPanel({ app, projectId }: { app: ModuleProps; projectId: string }) {
  const t = useT(), [selected, setSelected] = useState<string | null>(null);
  const entries = (app.snapshot.projectNotes ?? []).filter(entry => entry.projectId === projectId && entry.noteKind === 'journal').sort((a,b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  const entry = entries.find(item => item.id === selected);
  const close = () => setSelected(null);
  return <section className="cp-project-section project-journal" aria-label={t('journal.title')}>
    <div className="cp-section-heading"><h3>{t('journal.title')}</h3><button type="button" onClick={() => setSelected('new')}>{t('journal.add')}</button></div>
    {!entries.length && <p className="empty-state">{t('journal.empty')}</p>}
    <ul className="journal-entries">{entries.map(item => <li key={item.id}><button type="button" onClick={() => setSelected(item.id)}><time dateTime={businessDate(item.createdAt)}>{businessDate(item.createdAt)}</time></button></li>)}</ul>
    {(selected === 'new' || entry) && <JournalDialog app={app} projectId={projectId} entry={entry} onClose={close} onDone={close} />}
  </section>;
}

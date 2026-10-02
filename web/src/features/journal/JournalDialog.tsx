import { useState } from 'react';
import type { ProjectNote } from '@pirata/contracts/index';
import { businessDate } from '@pirata/domain/lib/dates';
import type { RegisteredDialogProps } from '../../live/dialogRegistry';
import { useT } from '../../i18n';
import { TranslatedText } from '../../components/TranslatedText';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { WorkForm } from '../tasks-time/WorkForm';
import { DeleteButton, mayDelete } from '../trash';
import './styles.css';

export function JournalDialog({ app, projectId, entry, onClose, onDone }: RegisteredDialogProps & { entry?: ProjectNote }) {
  const t = useT(), [editing, setEditing] = useState(!entry);
  const fixedProject = entry?.projectId ?? projectId;
  const project = app.snapshot.projects.find(item => item.id === fixedProject);
  if (!app.snapshot.projectJournalsVisible) return null;
  return <WorkDialog title={entry ? businessDate(entry.createdAt) : t('journal.add')} className="journal-dialog" onClose={onClose}>
    {project && <p className="journal-project-name">{project.name}</p>}
    {!editing && entry ? <>
      <p className="muted">{t('journal.by', { name: app.snapshot.team?.find(person => person.id === entry.createdBy)?.name ?? '—' })}</p>
      <TranslatedText kind="projectNote" id={entry.id} field="body" text={entry.body} as="p" className="journal-body" />
      <button type="button" onClick={() => setEditing(true)}>{t('journal.edit')}</button>
      {mayDelete(app, 'projectNote', entry as unknown as Record<string,unknown>) && <DeleteButton app={app} kind="projectNote" id={entry.id} label={businessDate(entry.createdAt)} onDone={onDone} />}
    </> : <WorkForm app={app} initial={{ projectId: fixedProject ?? '', body: entry?.body ?? '' }}
      command={values => ({ type: 'journal.save', ...(entry ? { id: entry.id } : {}), projectId: values.projectId, body: values.body })}
      validate={(values): Record<string,string> => {
        const errors: Record<string,string> = {};
        if (!app.snapshot.projects.some(item => item.id === values.projectId)) errors.projectId = t('journal.choose');
        if (!values.body.trim()) errors.body = t('journal.required');
        return errors;
      }} message={t('journal.saved')} done={onDone} submitLabel={t('journal.save')}>
      {draft => <>
        {!fixedProject && draft.field('projectId', t('journal.project'), { options: [{ value:'', label:t('journal.choose') }, ...app.snapshot.projects.map(item => ({ value:item.id, label:item.name }))] })}
        {!app.snapshot.projects.length && <p>{t('journal.noProjects')}</p>}
        {draft.field('body', t('journal.body'), { type:'textarea', hint:t('journal.limit') })}
        {!entry && <p className="muted">{t('journal.dateHint')}</p>}
      </>}
    </WorkForm>}
  </WorkDialog>;
}

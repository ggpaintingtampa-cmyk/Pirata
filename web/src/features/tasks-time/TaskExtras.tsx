import { useState } from 'react';
import { DeleteButton, mayDelete } from '../trash';
import { subtree } from '@pirata/contracts/index';
import type { Task } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, useLocale } from '../../i18n';
import { formatDateTime } from '../../i18n/locale';
import { TranslatedText } from '../../components/TranslatedText';
import { useCan } from '../../state/permissions';
import { ThumbStrip } from '../../components/ThumbStrip';
import { runCommand } from '../work/commands';
import { CommandButton } from './TaskChecklist';
import { RequirementChips, RequirementsEditor, cleanRequirements, type RequirementDraft } from '../templates/RequirementsEditor';
import { canEditDone } from '../work/dayList';
/** Task-sheet additions for the update: who completed it, pinned paint notes, tiny photo strip, questions with answers. */
export function TaskExtras({ app, task }: { app: ModuleProps; task: Task }) {
  const t = useT(), locale = useLocale(), office = useCan('plan.others'), [answer, setAnswer] = useState<Record<string, string>>({}), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [draft, setDraft] = useState<RequirementDraft[] | null>(null);
  const requirements = (app.snapshot.taskRequirements ?? []).filter(r => r.taskId === task.id);
  const catalog = { materials: app.snapshot.materials.map(m => ({ id: m.id, name: m.name })), equipment: app.snapshot.equipment.filter(e => e.archivedAt === null).map(e => ({ id: e.id, name: e.name })) };
  const mayEditNeeds = !task.archivedAt && canEditDone(task, app.snapshot.currentUser?.id, app.snapshot.currentUser?.role, app.snapshot.serverNow);
  const snapshot = app.snapshot, nodes = subtree(snapshot.tasks, task.id), team = snapshot.team ?? [];
  const name = (id: string | null | undefined) => team.find(member => member.id === id)?.name ?? '—';
  const pinned = (snapshot.projectNotes ?? []).filter(note => note.projectId === task.projectId && note.pinned);
  const attachments = (snapshot.attachments ?? []).filter(file => file.parentType === 'task' && nodes.some(node => node.id === file.parentId));
  const questions = (snapshot.taskQuestions ?? []).filter(question => nodes.some(node => node.id === question.taskId)).sort((a, b) => b.createdAt - a.createdAt);
  const reply = async (id: string) => { const text = (answer[id] ?? '').trim(); if (!text) return; setBusy(id); setError((await runCommand(app, { type: 'question.answer', id, answer: text })) ?? ''); setBusy(''); };
  return <div className="task-extras">
    <div className="task-needs"><div className="task-results-heading"><span>{t('tasks.needs')}</span>{mayEditNeeds && draft === null && <button type="button" className="work-link-button" onClick={() => setDraft(requirements.map(({ kind, name, materialId, equipmentId, quantity, unit, note }) => ({ kind, name, materialId, equipmentId, quantity, unit, note })))}>{t('tasks.needs.edit')}</button>}</div>
      {draft === null ? requirements.length ? <RequirementChips rows={requirements} /> : <p className="muted">{t('tasks.needs.none')}</p>
        : <><RequirementsEditor idPrefix={'task-' + task.id} value={draft} onChange={setDraft} materials={catalog.materials} equipment={catalog.equipment} /><p className="muted">{t('templates.requirements.hint')}</p><div className="live-actions"><CommandButton app={app} command={{ type: 'task.setRequirements', taskId: task.id, requirements: cleanRequirements(draft, catalog) }} message={t('tasks.needs.saved')} onSuccess={() => setDraft(null)}>{t('tasks.needs.save')}</CommandButton><button type="button" onClick={() => setDraft(null)}>{t('templates.cancel')}</button></div></>}
      {requirements.some(r => r.sourceTemplateId) && <small className="muted">{t('tasks.needs.fromTemplate', { version: requirements.find(r => r.sourceTemplateVersion)?.sourceTemplateVersion ?? 1 })}</small>}</div>
    {task.completedAt && <p className="muted">{t('tasks.doneBy', { name: name(task.completedBy), time: formatDateTime(locale, task.completedAt) })}</p>}
    {pinned.length > 0 && <div className="day-paint"><strong>{t('tasks.paint')}</strong>{pinned.map(note => <p key={note.id}><span><TranslatedText kind="projectNote" id={note.id} field="title" text={note.title} compact /></span> {[note.product, note.color, note.colorCode, note.finish, note.quantity].filter(Boolean).join(' · ')}</p>)}</div>}
    <ThumbStrip attachments={attachments} />
    {questions.length > 0 && <div className="task-questions"><strong>{t('tasks.questions')}</strong>{questions.map(question => <div key={question.id} className="task-question"><p><strong>{name(question.askedBy)}</strong> · {formatDateTime(locale, question.createdAt)}{mayDelete(app, 'question', question as unknown as Record<string, unknown>) && <> · <DeleteButton app={app} kind="question" id={question.id} label={question.body.slice(0, 40)} className="work-link-button" /></>}</p><TranslatedText kind="question" id={question.id} field="body" text={question.body} as="p" />
      {question.answeredAt ? <p className="task-question-answer">{t('tasks.answerBy', { name: name(question.answeredBy) })}: <TranslatedText kind="question" id={question.id} field="answer" text={question.answer} /></p> : office ? <div className="live-actions"><input placeholder={t('tasks.answerPlaceholder')} value={answer[question.id] ?? ''} onChange={e => setAnswer({ ...answer, [question.id]: e.target.value })} /><button type="button" disabled={busy === question.id} onClick={() => void reply(question.id)}>{t('tasks.answer')}</button></div> : <p className="muted">{t('tasks.unanswered')}</p>}</div>)}</div>}
    {error && <p role="alert" className="work-error">{error}</p>}
  </div>;
}

import { useState } from 'react';
import { subtree } from '@pirata/contracts/index';
import type { Task } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { useCan } from '../../state/permissions';
import { ThumbStrip } from '../../components/ThumbStrip';
import { runCommand } from '../work/commands';
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Task-sheet additions for the update: who completed it, pinned paint notes, tiny photo strip, questions with answers. */
export function TaskExtras({ app, task }: { app: ModuleProps; task: Task }) {
  const t = useT(), office = useCan('plan.others'), [answer, setAnswer] = useState<Record<string, string>>({}), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const snapshot = app.snapshot, nodes = subtree(snapshot.tasks, task.id), team = snapshot.team ?? [];
  const name = (id: string | null | undefined) => team.find(member => member.id === id)?.name ?? '—';
  const pinned = (snapshot.projectNotes ?? []).filter(note => note.projectId === task.projectId && note.pinned);
  const attachments = (snapshot.attachments ?? []).filter(file => file.parentType === 'task' && nodes.some(node => node.id === file.parentId));
  const questions = (snapshot.taskQuestions ?? []).filter(question => nodes.some(node => node.id === question.taskId)).sort((a, b) => b.createdAt - a.createdAt);
  const reply = async (id: string) => { const text = (answer[id] ?? '').trim(); if (!text) return; setBusy(id); setError((await runCommand(app, { type: 'question.answer', id, answer: text })) ?? ''); setBusy(''); };
  return <div className="task-extras">
    {task.completedAt && <p className="muted">{t('tasks.doneBy', { name: name(task.completedBy), time: timeFormat.format(task.completedAt) })}</p>}
    {pinned.length > 0 && <div className="day-paint"><strong>{t('tasks.paint')}</strong>{pinned.map(note => <p key={note.id}><span>{note.title}</span> {[note.product, note.color, note.colorCode, note.finish, note.quantity].filter(Boolean).join(' · ')}</p>)}</div>}
    <ThumbStrip attachments={attachments} />
    {questions.length > 0 && <div className="task-questions"><strong>{t('tasks.questions')}</strong>{questions.map(question => <div key={question.id} className="task-question"><p><strong>{name(question.askedBy)}</strong> · {timeFormat.format(question.createdAt)}</p><p>{question.body}</p>
      {question.answeredAt ? <p className="task-question-answer">{t('tasks.answerBy', { name: name(question.answeredBy) })}: {question.answer}</p> : office ? <div className="live-actions"><input placeholder={t('tasks.answerPlaceholder')} value={answer[question.id] ?? ''} onChange={e => setAnswer({ ...answer, [question.id]: e.target.value })} /><button type="button" disabled={busy === question.id} onClick={() => void reply(question.id)}>{t('tasks.answer')}</button></div> : <p className="muted">{t('tasks.unanswered')}</p>}</div>)}</div>}
    {error && <p role="alert" className="work-error">{error}</p>}
  </div>;
}

import type { RegisteredDialogProps } from '../../live/dialogRegistry';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { WorkForm } from '../tasks-time/WorkForm';
import { useT } from '../../i18n';
/** Ask a question about a step; it is catalogued on the project for everyone and listed in the daily report (R-DAILY-8). */
export function QuestionDialog({ app, projectId, taskId, onClose, onDone }: RegisteredDialogProps) {
  const t = useT();
  const candidates = app.snapshot.tasks.filter(task => !task.archivedAt && task.projectId && (!projectId || task.projectId === projectId));
  const projectName = app.snapshot.projects.find(item => item.id === (projectId ?? candidates.find(task => task.id === taskId)?.projectId))?.name ?? t('work.plan.project');
  const label = (id: string) => { const task = candidates.find(item => item.id === id); const project = app.snapshot.projects.find(item => item.id === task?.projectId); return task ? task.title + (project ? ' · ' + project.name : '') : id; };
  return <WorkDialog title={t('work.question.title')} onClose={onClose}>
    <WorkForm app={app} initial={{ taskId: taskId ?? candidates[0]?.id ?? '', body: '' }} command={v => ({ type: 'question.ask', taskId: v.taskId, body: v.body })} validate={(v): Record<string, string> => (v.body.trim() ? {} : { body: t('work.question.required') })} message={t('work.question.saved')} done={onDone}>
      {d => <><p className="task-parent-hint">{t('work.question.recipient', { project: projectName })}</p>{taskId ? <p className="task-parent-hint">{label(taskId)}</p> : d.field('taskId', t('work.question.task'), { options: candidates.map(task => ({ value: task.id, label: label(task.id) })) })}
        {d.field('body', t('work.question.body'), { type: 'textarea', hint: t('work.question.hint') })}</>}
    </WorkForm>
  </WorkDialog>;
}

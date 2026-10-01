import { useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { BusinessCommand, Task } from '@pirata/contracts/index';
import { orderedChildren, taskDepth } from '@pirata/contracts/index';
import { completionPercent, projectCompletion } from '@pirata/contracts/progress';
import { formatDuration } from '@pirata/domain/lib/time';
import type { ModuleProps } from '../../services/moduleProps';
import { createMutation, createSubmission, ServiceError } from '../../services/api';
import { tx, useLocale, useT } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { TranslatedText } from '../../components/TranslatedText';
import { WorkDialog } from './WorkDialog';
import { WorkForm } from './WorkForm';
import { CompletionRing } from './CompletionRing';
import { runCommand } from '../work/commands';
import { affectedSession, canEditDone, treeCompletion } from '../work/dayList';
import { SelectBox, SelectToggle } from '../bulk';

/** Retains a request through uncertain responses, including a successful write whose refresh failed. */
export function CommandButton({ app, command, children, message, disabled = false, onSuccess }: { app: ModuleProps; command: BusinessCommand; children: ReactNode; message: string; disabled?: boolean; onSuccess?(): void }) {
  const t = useT(), locale = useLocale();
  const pending = useRef<ReturnType<typeof createSubmission> | null>(null), acknowledged = useRef(false), lock = useRef(false), refreshSession=useRef(false);
  const [phase,setPhase] = useState<'idle'|'busy'|'retry'|'conflict'>('idle'), [error,setError] = useState('');
  async function save() {
    if (lock.current) return;
    lock.current = true;
    if (phase === 'conflict') { try { await app.refresh(); pending.current = null; setPhase('idle'); setError(t('shell.command.latestLoaded')); } catch { setError(t('shell.command.refreshFailed')); } finally { lock.current = false; } return; }
    pending.current ??= createSubmission(app.service, createMutation(command,app.snapshot.revision));
    setPhase('busy'); setError('');
    try { if(refreshSession.current){const session=await app.service.session();if(!session.authenticated){setPhase('retry');setError(t('shell.command.signInRetry'));return;}refreshSession.current=false;} if (!acknowledged.current) { await pending.current.submit(); acknowledged.current = true; } await app.refresh(); app.onSaved(message); pending.current = null; acknowledged.current = false; setPhase('idle'); onSuccess?.(); }
    catch (cause) {
      if (!acknowledged.current && cause instanceof ServiceError && cause.code === 'REVISION_CONFLICT') { setPhase('conflict'); setError(t('shell.command.conflictLoad')); }
      else if(!acknowledged.current&&cause instanceof ServiceError&&[401,403].includes(cause.status)){refreshSession.current=cause.status===401;setPhase(cause.status===401?'retry':'idle');pending.current=cause.status===401?pending.current:null;setError(cause.status===401?t('shell.command.reauth'):errorMessage(locale, cause));}
      else if (!acknowledged.current && cause instanceof ServiceError && [400,404,409,422].includes(cause.status)) { pending.current = null; setPhase('idle'); setError(errorMessage(locale, cause)); }
      else { setPhase('retry'); setError(acknowledged.current ? t('shell.command.savedRetry') : t('shell.command.unconfirmed')); }
    } finally { lock.current = false; }
  }
  const savePhase=phase==='busy'?'saving':phase==='retry'?'uncertain':undefined;
  return <span className="command-control" data-save-phase={savePhase}><button type="button" disabled={disabled || phase === 'busy'} onClick={() => void save()}>{phase === 'busy' ? t('shell.form.saving') : phase === 'retry' ? t('shell.command.retryAction') : phase === 'conflict' ? t('shell.command.loadLatest') : children}</button>{error && <span role="alert" className="work-error">{error}</span>}</span>;
}

export function QuickTaskCapture({ app, projectId = null, parentTaskId = null }: { app: ModuleProps; projectId?: string | null; parentTaskId?: string | null }) {
  const t = useT(), [generation,setGeneration] = useState(0), [template,setTemplate] = useState(false);
  const depth = parentTaskId ? taskDepth(app.snapshot.tasks, parentTaskId) + 1 : 0;
  const label = depth === 0 ? tx('Tasks') : depth === 1 ? t('tasks.subtasks') : t('tasks.tiny');
  return <details className="quick-task-capture"><summary><span><Plus size={17} aria-hidden="true"/>{tx('Add {items} quickly',{items:label.toLowerCase()})}</span><ChevronDown size={16} aria-hidden="true"/></summary>
    <WorkForm key={generation} app={app} initial={{titles:''}} includeCancel={false} submitLabel={tx('Save and add another')}
      command={v => ({type:'task.batchCreate',titles:v.titles.split('\n').map(title=>title.trim()).filter(Boolean),projectId,parentTaskId,assigneeId:null})}
      message={label+' '+tx('saved.')} done={() => setGeneration(n=>n+1)}>
      {d => d.field('titles',label+' — '+tx('one per line'),{type:'textarea',hint:tx('A name is enough. Add up to 50 items together; details can wait.')})}
    </WorkForm>
    {depth < 2 && (app.snapshot.taskTemplates ?? []).map(item => <CommandButton key={item.id} app={app} command={item.tree ? {type:'taskTemplate.applyTree',templateId:item.id,projectId:projectId ?? '',parentTaskId} : {type:'taskTemplate.apply',templateId:item.id,projectId,parentTaskId}} message={tx('Template tasks added.')} disabled={Boolean(item.tree) && !projectId}>{tx('Use')} {item.name}</CommandButton>)}
    <button type="button" onClick={()=>setTemplate(true)}>{tx('Save a reusable list')}</button>
    {template && <WorkDialog title={tx('Save task template')} onClose={()=>setTemplate(false)}><WorkForm app={app} initial={{name:'',titles:''}} command={v=>({type:'taskTemplate.save',name:v.name,titles:v.titles.split('\n').map(title=>title.trim()).filter(Boolean)})} message={tx('Task template saved.')} done={()=>setTemplate(false)}>{d=><>{d.field('name',tx('Template name'))}{d.field('titles',tx('Task names — one per line'),{type:'textarea'})}</>}</WorkForm></WorkDialog>}
  </details>;
}

/** Up/down within the sibling list, persisted as positions (task.reorder). */
export function ReorderButtons({ app, task }: { app: ModuleProps; task: Task }) {
  const t = useT(), [busy, setBusy] = useState(false);
  if (!task.projectId) return null;
  const siblings = orderedChildren(app.snapshot.tasks, task.parentTaskId ?? null, task.projectId), index = siblings.findIndex(item => item.id === task.id);
  const move = async (delta: number) => { const ids = siblings.map(item => item.id); const target = index + delta; if (target < 0 || target >= ids.length) return; [ids[index], ids[target]] = [ids[target], ids[index]]; setBusy(true); const message = await runCommand(app, { type: 'task.reorder', projectId: task.projectId!, parentTaskId: task.parentTaskId ?? null, orderedIds: ids }); setBusy(false); if (message) app.onSaved(message); };
  return <span className="task-reorder"><button type="button" aria-label={t('tasks.moveUp')} disabled={busy || index <= 0} onClick={() => void move(-1)}><ArrowUp size={13} aria-hidden="true" /></button><button type="button" aria-label={t('tasks.moveDown')} disabled={busy || index >= siblings.length - 1} onClick={() => void move(1)}><ArrowDown size={13} aria-hidden="true" /></button></span>;
}

export function TaskCheck({ app, task, showEstimate = false }: { app: ModuleProps; task: Task; showEstimate?: boolean }) {
  const t = useT(), [confirm,setConfirm] = useState(false);
  const children = orderedChildren(app.snapshot.tasks, task.id, task.projectId ?? null), completion = treeCompletion(app.snapshot.tasks, task.id);
  const finishing = task.status !== 'done', timer=app.snapshot.runningTimer;
  const sessionId = affectedSession(app.snapshot, task.id), affectedTimer = Boolean(timer && sessionId);
  const editable = canEditDone(task, app.snapshot.currentUser?.id, app.snapshot.currentUser?.role, app.snapshot.serverNow);
  const command:BusinessCommand={type:'task.setStatus',id:task.id,status:finishing?'done':'open',expectedSessionId:finishing?sessionId:null};
  const label=(finishing?tx('Complete'):tx('Reopen'))+' '+task.title;
  return <div className={"task-check-row "+(task.status==='done'?'task-check-complete':'')}>
    <SelectBox kind="task" id={task.id} label={task.title}/>
    {!finishing && !editable ? <span className="task-check-box is-locked" title={t('tasks.locked')} aria-label={t('tasks.locked')}><Check size={15}/></span>
      : finishing&&(completion.done<completion.total&&completion.total>1||affectedTimer) ? <button type="button" aria-label={label} onClick={()=>setConfirm(true)}><span className="task-check-box" aria-hidden="true"/></button>
      : <CommandButton app={app} command={command} message={finishing?tx('Task complete.'):tx('Task reopened.')}><span className="task-check-box" aria-hidden="true">{!finishing&&<Check size={15}/>}</span><span className="visually-hidden">{label}</span></CommandButton>}
    <button className="task-name" aria-label={task.title} onClick={()=>app.onOpenTask(task.id)}><span><TranslatedText kind="task" id={task.id} field="title" text={task.title} compact/>{task.description&&<small><TranslatedText kind="task" id={task.id} field="description" text={task.description} compact/></small>}<small>{children.length ? completionPercent(completion.fraction)+'% · '+completion.done+'/'+completion.total : task.status==='done'?tx('Complete'):task.status==='blocked'?tx('Blocked'):''}</small></span>{showEstimate&&task.estimatedMinutes>0?<span className="task-estimate-badge">{formatDuration(task.estimatedMinutes*60000)}</span>:<ChevronRight size={16} aria-hidden="true"/>}</button>
    <ReorderButtons app={app} task={task} />
    {confirm && <WorkDialog title={tx('Complete task and checklist')} onClose={()=>setConfirm(false)}><WorkForm app={app} initial={{}} command={()=>command} message={tx('Task and checklist complete.')} done={()=>setConfirm(false)} submitLabel={tx('Complete task and remaining steps')}>{()=> <p>{tx('Complete “{title}”',{title:task.title})}{children.length?' '+tx('and every step under it'):''}{affectedTimer?', '+tx('saving and stopping your running timer'):''}?</p>}</WorkForm></WorkDialog>}
  </div>;
}

/** Three levels: the list under a task shows subtasks and their tiny tasks; each level can add children while depth allows. */
export function TaskChecklist(app: ModuleProps & { parentTaskId?: string; compact?: boolean }) {
  const t = useT(), all = app.snapshot.tasks;
  const parent = all.find(task => task.id === app.parentTaskId), parentDepth = parent ? taskDepth(all, parent.id) : -1;
  const tasks = parent ? orderedChildren(all, parent.id, parent.projectId ?? null) : all.filter(task=>!task.archivedAt&&!task.parentTaskId&&(!app.selection?.projectId||task.projectId===app.selection.projectId)).sort((a,b)=>(a.position??0)-(b.position??0)||a.createdAt-b.createdAt);
  const progress=app.selection?.projectId?projectCompletion(app.selection.projectId,all):null;
  const completion = parent ? treeCompletion(all, parent.id) : null;
  const heading = parentDepth === 1 ? t('tasks.tiny') : parent ? t('tasks.subtasks') : tx('Tasks');
  return <section className={'work-module task-checklist'+(parent?' task-subtask-list':'')} aria-label={heading}>
    {parent&&completion&&!app.compact&&<div className="task-checklist-summary"><CompletionRing fraction={completion.fraction} label={tx('Task completion')} size={64}/><div><h3>{heading}</h3><p>{completion.total>1?t('work.steps',{done:completion.done,total:completion.total}):tx('Break it into a few simple steps.')}</p></div></div>}
    <div className="task-checklist-heading"><h3>{heading}</h3>{progress!==null&&!parent&&<span>{tx('Project completion:')} {completionPercent(progress)}%</span>}{!parent&&<SelectToggle/>}{!parent&&<button className="work-primary" onClick={()=>app.onAddTask(app.selection?.projectId??null)}><Plus size={16} aria-hidden="true"/>{tx('Add task')}</button>}</div>
    {!tasks.length&&<p>{parent?tx('Add the practical steps for this task.'):tx('Add the next piece of work.')}</p>}
    {tasks.map(task=><div key={task.id}><TaskCheck app={app} task={task} showEstimate={Boolean(parent)}/>
      {taskDepth(all, task.id) < 2 && !app.compact && orderedChildren(all, task.id, task.projectId ?? null).map(child=><div className="task-child" key={child.id}><TaskCheck app={app} task={child}/>
        {taskDepth(all, child.id) < 2 && orderedChildren(all, child.id, child.projectId ?? null).map(grandchild=><div className="task-child task-grandchild" key={grandchild.id}><TaskCheck app={app} task={grandchild}/></div>)}
      </div>)}
      {parent && parentDepth === 0 && !app.compact && <div className="task-child"><QuickTaskCapture app={app} projectId={task.projectId ?? null} parentTaskId={task.id}/></div>}
    </div>)}
    {(!parent || parentDepth < 2) && <QuickTaskCapture app={app} projectId={parent?.projectId ?? app.selection?.projectId ?? null} parentTaskId={parent?.id ?? null}/>}
  </section>;
}

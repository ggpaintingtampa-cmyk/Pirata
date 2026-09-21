import { useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { BusinessCommand, Task } from '@pirata/contracts/index';
import { completionPercent, projectCompletion, taskCompletion } from '@pirata/contracts/progress';
import { formatDuration } from '@pirata/domain/lib/time';
import type { ModuleProps } from '../../services/moduleProps';
import { createMutation, createSubmission, ServiceError } from '../../services/api';
import { WorkDialog } from './WorkDialog';
import { WorkForm } from './WorkForm';
import { CompletionRing } from './CompletionRing';

/** Retains a request through uncertain responses, including a successful write whose refresh failed. */
export function CommandButton({ app, command, children, message, disabled = false, onSuccess }: { app: ModuleProps; command: BusinessCommand; children: ReactNode; message: string; disabled?: boolean; onSuccess?(): void }) {
  const pending = useRef<ReturnType<typeof createSubmission> | null>(null), acknowledged = useRef(false), lock = useRef(false), refreshSession=useRef(false);
  const [phase,setPhase] = useState<'idle'|'busy'|'retry'|'conflict'>('idle'), [error,setError] = useState('');
  async function save() {
    if (lock.current) return;
    lock.current = true;
    if (phase === 'conflict') { try { await app.refresh(); pending.current = null; setPhase('idle'); setError('Latest records loaded. Review and try the action again.'); } catch { setError('Could not refresh. Try again.'); } finally { lock.current = false; } return; }
    pending.current ??= createSubmission(app.service, createMutation(command,app.snapshot.revision));
    setPhase('busy'); setError('');
    try { if(refreshSession.current){const session=await app.service.session();if(!session.authenticated){setPhase('retry');setError('Sign in in another tab, then retry this same action.');return;}refreshSession.current=false;} if (!acknowledged.current) { await pending.current.submit(); acknowledged.current = true; } await app.refresh(); app.onSaved(message); pending.current = null; acknowledged.current = false; setPhase('idle'); onSuccess?.(); }
    catch (cause) {
      if (!acknowledged.current && cause instanceof ServiceError && cause.code === 'REVISION_CONFLICT') { setPhase('conflict'); setError('Records changed. Load the latest records and review.'); }
      else if(!acknowledged.current&&cause instanceof ServiceError&&[401,403].includes(cause.status)){refreshSession.current=true;setPhase('retry');setError('Your sign-in needs refreshing. Retry the same action.');}
      else if (!acknowledged.current && cause instanceof ServiceError && [400,404,409,422].includes(cause.status)) { pending.current = null; setPhase('idle'); setError(cause.message); }
      else { setPhase('retry'); setError(acknowledged.current ? 'Saved. Retry to refresh the result.' : 'Response not confirmed. Retry this same action safely.'); }
    } finally { lock.current = false; }
  }
  const savePhase=phase==='busy'?'saving':phase==='retry'?'uncertain':undefined;
  return <span className="command-control" data-save-phase={savePhase}><button type="button" disabled={disabled || phase === 'busy'} onClick={() => void save()}>{phase === 'busy' ? 'Saving…' : phase === 'retry' ? 'Retry same action' : phase === 'conflict' ? 'Load latest records' : children}</button>{error && <span role="alert" className="work-error">{error}</span>}</span>;
}

export function QuickTaskCapture({ app, projectId = null, parentTaskId = null }: { app: ModuleProps; projectId?: string | null; parentTaskId?: string | null }) {
  const [generation,setGeneration] = useState(0), [template,setTemplate] = useState(false);
  const label = parentTaskId ? 'Subtasks' : 'Tasks';
  return <details className="quick-task-capture"><summary><span><Plus size={17} aria-hidden="true"/>Add {label.toLowerCase()} quickly</span><ChevronDown size={16} aria-hidden="true"/></summary>
    <WorkForm key={generation} app={app} initial={{titles:''}} includeCancel={false} submitLabel="Save and add another"
      command={v => ({type:'task.batchCreate',titles:v.titles.split('\n').map(title=>title.trim()).filter(Boolean),projectId,parentTaskId,assigneeId:null})}
      message={label+' saved.'} done={() => setGeneration(n=>n+1)}>
      {d => d.field('titles',parentTaskId ? 'Subtask names — one per line' : 'Task names — one per line',{type:'textarea',hint:'A name is enough. Add up to 50 items together; details can wait.'})}
    </WorkForm>
    {(app.snapshot.taskTemplates ?? []).map(item => <CommandButton key={item.id} app={app} command={{type:'taskTemplate.apply',templateId:item.id,projectId,parentTaskId}} message="Template tasks added.">Use {item.name}</CommandButton>)}
    <button type="button" onClick={()=>setTemplate(true)}>Save a reusable list</button>
    {template && <WorkDialog title="Save task template" onClose={()=>setTemplate(false)}><WorkForm app={app} initial={{name:'',titles:''}} command={v=>({type:'taskTemplate.save',name:v.name,titles:v.titles.split('\n').map(title=>title.trim()).filter(Boolean)})} message="Task template saved." done={()=>setTemplate(false)}>{d=><>{d.field('name','Template name')}{d.field('titles','Task names — one per line',{type:'textarea'})}</>}</WorkForm></WorkDialog>}
  </details>;
}

export function TaskCheck({ app, task, showEstimate = false }: { app: ModuleProps; task: Task; showEstimate?: boolean }) {
  const [confirm,setConfirm] = useState(false);
  const children = app.snapshot.tasks.filter(child=>child.parentTaskId===task.id&&!child.archivedAt), fraction = taskCompletion(task,app.snapshot.tasks);
  const finishing = task.status !== 'done', timer=app.snapshot.runningTimer;
  const affectedTimer = timer && (timer.taskId===task.id || children.some(child=>child.id===timer.taskId));
  const command:BusinessCommand={type:'task.setStatus',id:task.id,status:finishing?'done':'open',expectedSessionId:finishing&&affectedTimer?timer.sessionId:null};
  const label=(finishing?'Complete ':'Reopen ')+task.title;
  return <div className={"task-check-row "+(task.status==='done'?'task-check-complete':'')}>
    {finishing&&(children.some(child=>child.status!=='done')||affectedTimer) ? <button type="button" aria-label={label} onClick={()=>setConfirm(true)}><span className="task-check-box" aria-hidden="true"/></button> : <CommandButton app={app} command={command} message={finishing?'Task complete.':'Task reopened.'}><span className="task-check-box" aria-hidden="true">{!finishing&&<Check size={15}/>}</span><span className="visually-hidden">{label}</span></CommandButton>}
    <button className="task-name" aria-label={task.title} onClick={()=>app.onOpenTask(task.id)}><span>{task.title}<small>{children.length ? completionPercent(fraction)+'% · '+children.filter(child=>child.status==='done').length+'/'+children.length+' subtasks' : task.status==='done'?'Complete':task.status==='blocked'?'Blocked':''}</small></span>{showEstimate&&task.estimatedMinutes>0?<span className="task-estimate-badge">{formatDuration(task.estimatedMinutes*60000)}</span>:<ChevronRight size={16} aria-hidden="true"/>}</button>
    {confirm && <WorkDialog title="Complete task and checklist" onClose={()=>setConfirm(false)}><WorkForm app={app} initial={{}} command={()=>command} message="Task and checklist complete." done={()=>setConfirm(false)} submitLabel="Complete task and remaining subtasks">{()=> <p>Complete “{task.title}”{children.length?' and all remaining subtasks':''}{affectedTimer?', saving and stopping your running timer':''}?</p>}</WorkForm></WorkDialog>}
  </div>;
}

export function TaskChecklist(app: ModuleProps & { parentTaskId?: string; compact?: boolean }) {
  const tasks=app.snapshot.tasks.filter(task=>!task.archivedAt&&(app.parentTaskId?task.parentTaskId===app.parentTaskId:!task.parentTaskId)&&(!app.selection?.projectId||task.projectId===app.selection.projectId));
  const progress=app.selection?.projectId?projectCompletion(app.selection.projectId,app.snapshot.tasks):null;
  const parent=app.snapshot.tasks.find(task=>task.id===app.parentTaskId);
  return <section className={'work-module task-checklist'+(app.parentTaskId?' task-subtask-list':'')} aria-label={app.parentTaskId?'Subtasks':'Project tasks'}>
    {parent&&!app.compact&&<div className="task-checklist-summary"><CompletionRing fraction={taskCompletion(parent,app.snapshot.tasks)} label="Task completion" size={64}/><div><h3>Subtask checklist</h3><p>{tasks.length?`${tasks.filter(task=>task.status==='done').length} of ${tasks.length} steps completed`:'Break it into a few simple steps.'}</p></div></div>}
    <div className="task-checklist-heading"><h3>{app.parentTaskId?'Subtasks':'Tasks'}</h3>{progress!==null&&!app.parentTaskId&&<span>Project completion: {completionPercent(progress)}%</span>}{!app.parentTaskId&&<button className="work-primary" onClick={()=>app.onAddTask(app.selection?.projectId??null)}><Plus size={16} aria-hidden="true"/>Add task</button>}</div>
    {!tasks.length&&<p>{app.parentTaskId?'Add the practical steps for this task.':'Add the next piece of work.'}</p>}
    {tasks.map(task=><div key={task.id}><TaskCheck app={app} task={task} showEstimate={Boolean(app.parentTaskId)}/>{!app.parentTaskId&&!app.compact&&app.snapshot.tasks.filter(child=>child.parentTaskId===task.id&&!child.archivedAt).map(child=><div className="task-child" key={child.id}><TaskCheck app={app} task={child}/></div>)}</div>)}
    <QuickTaskCapture app={app} projectId={app.selection?.projectId??null} parentTaskId={app.parentTaskId??null}/>
  </section>;
}

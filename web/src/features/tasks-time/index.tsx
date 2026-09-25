import { taskDepth } from '@pirata/contracts/index';
import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Clipboard, ListFilter, Pause, Play, Plus, Search, Timer } from 'lucide-react';
import type { BusinessCommand, TimeEntry } from '@pirata/contracts/index';
import { entryMilliseconds, formatClock, formatDuration } from '@pirata/domain/lib/time';
import type { ModuleProps } from '../../services/moduleProps';
import { WorkDialog } from './WorkDialog';
import { WorkForm, type Values } from './WorkForm';
import { actualMilliseconds, minute, timestamp } from './time';
import { useServerNow } from './useServerNow';
import './styles.css';
export { TaskChecklist, TaskCheck, QuickTaskCapture, CommandButton } from './TaskChecklist';
export { CompletionRing } from './CompletionRing';

export function TaskList(app: ModuleProps) {
  const now = useServerNow(app.snapshot);
  const [query,setQuery]=useState(''),[status,setStatus]=useState('active'),[person,setPerson]=useState('all'),[project,setProject]=useState(app.selection?.projectId??'all');
  const search=query.trim().toLocaleLowerCase();
  const available=app.snapshot.tasks.filter(task=>!task.archivedAt);
  const tasks=available.filter(task=>
    (status==='all'||status==='active'&&task.status!=='done'||task.status===status)&&
    (person==='all'||person==='unassigned'&&!task.assigneeId||task.assigneeId===person)&&
    (project==='all'||project==='unfiled'&&!task.projectId||task.projectId===project)&&
    (!search||[task.title,task.note,app.snapshot.projects.find(item=>item.id===task.projectId)?.name??'',available.find(item=>item.id===task.parentTaskId)?.title??''].some(value=>value.toLocaleLowerCase().includes(search))));
  const filtered=Boolean(search||status!=='active'||person!=='all'||project!=='all');
  return <section className="work-module task-library" aria-label="Tasks">
    <div className="task-search"><Search size={19} aria-hidden="true"/><label className="visually-hidden" htmlFor="task-search">Search tasks</label><input id="task-search" type="search" placeholder="Search tasks, projects or notes" value={query} onChange={event=>setQuery(event.target.value)}/></div>
    <div className="task-filters"><label className="work-field">Task status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="active">Active tasks</option><option value="open">Open</option><option value="blocked">Blocked</option><option value="done">Completed</option><option value="all">All statuses</option></select></label><label className="work-field">Responsible person filter<select value={person} onChange={event=>setPerson(event.target.value)}><option value="all">Everyone</option><option value="unassigned">Unassigned</option>{(app.snapshot.team??[]).map(member=><option key={member.id} value={member.id}>{member.name}{member.disabledAt?' (inactive)':''}</option>)}</select></label><label className="work-field">Project filter<select value={project} onChange={event=>setProject(event.target.value)}><option value="all">All projects</option><option value="unfiled">Unfiled tasks</option>{app.snapshot.projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <div className="task-results-heading"><span>{tasks.length} {tasks.length===1?'task':'tasks'}{status==='active'?' remaining':''}</span>{filtered&&<button className="work-link-button" onClick={()=>{setQuery('');setStatus('active');setPerson('all');setProject(app.selection?.projectId??'all');}}><ListFilter size={15} aria-hidden="true"/>Reset filters</button>}<button className="work-link-button" onClick={()=>app.onAddTask(app.selection?.projectId??null)}><Plus size={15} aria-hidden="true"/>Add task</button></div>
    {!tasks.length && <div className="work-empty-state"><ListFilter size={25} aria-hidden="true"/><div><h3>{available.length?'Nothing matches just yet.':'Start with one small step.'}</h3><p>{available.length?'Try another search or change the filters.':'Add the next piece of work. A name is all you need.'}</p></div></div>}
    <div className="task-library-list">{tasks.map(task => {
      const total=actualMilliseconds(app.snapshot,task.id,now),parent=available.find(item=>item.id===task.parentTaskId),assigned=app.snapshot.team?.find(item=>item.id===task.assigneeId),running=app.snapshot.runningTimers?.some(item=>item.taskId===task.id);
      const contextId='task-list-context-'+task.id;
      return <article key={task.id} className={'task-library-item '+(task.status==='done'?'is-complete':'')+' depth-'+taskDepth(app.snapshot.tasks,task.id)}>
        <button className="task-library-open" aria-label={'Open task: '+task.title} aria-describedby={contextId} onClick={()=>app.onOpenTask(task.id)}>
          <span className={'task-status-icon task-status-'+task.status} aria-hidden="true">{task.status==='done'?<Check size={18}/>:running?<Timer size={18}/>:<Clipboard size={18}/>}</span>
          <span className="task-library-content"><strong className="task-library-name">{task.title}</strong>
            <span id={contextId}>
              {parent&&<span className="task-parent-context">Subtask of {parent.title}</span>}
              <span className="task-library-meta"><span>{app.snapshot.projects.find(item=>item.id===task.projectId)?.name??'Unfiled'}</span><span className="task-library-duration">{total===null?'Clock correction needed':total===0&&task.estimatedMinutes>0?formatDuration(task.estimatedMinutes*60000)+' estimated':formatDuration(total)+' logged'}</span></span>
              {(assigned||task.status!=='open'||running)&&<span className="task-library-secondary">{assigned?.name}{assigned&&(task.status!=='open'||running)?' · ':''}{task.status==='done'?'Complete':task.status==='blocked'?'Blocked':running?'In progress':''}</span>}
              {total!==null&&task.estimatedMinutes>0&&(total>task.estimatedMinutes*60000||task.status==='done')&&<span className="task-library-secondary">{total>task.estimatedMinutes*60000?formatDuration(total-task.estimatedMinutes*60000)+' over estimate':formatDuration(task.estimatedMinutes*60000-total)+' under estimate'}</span>}
            </span>
          </span><ChevronRight size={17} aria-hidden="true"/>
        </button>
      </article>;
    })}</div>
  </section>;
}

export function TaskEditor(app: ModuleProps & { backLabel?: string; onDone?(): void; parentTaskId?: string }) {
  const task = app.snapshot.tasks.find(t => t.id === app.selection?.taskId);
  const parent = app.snapshot.tasks.find(t=>t.id===(task?.parentTaskId??app.parentTaskId));
  const parentDepth = parent ? taskDepth(app.snapshot.tasks, parent.id) : -1, level = parentDepth >= 1 ? 'tiny task' : parent ? 'subtask' : 'task';
  if (app.selection?.taskId && !task) return <section className="work-module"><p role="alert">Task not found. Refresh and review.</p><button onClick={app.onClose}>Close</button></section>;
  return <WorkDialog title={(task ? 'Edit ' : 'Add ') + level} className="task-editor-dialog" onClose={app.onClose} backLabel={app.backLabel}><WorkForm app={app}
    initial={{ title: task?.title ?? '', description: task?.description ?? '', projectId: parent?.projectId ?? task?.projectId ?? app.selection?.projectId ?? '', assigneeId:!parent||task?.assignmentExplicit?task?.assigneeId??'':'', estimatedMinutes: task?.estimatedMinutes ? String(task.estimatedMinutes) : '', note: task?.note ?? '', scheduled: 'no', 'schedule.date': app.businessDate, 'schedule.startMinute': '09:00', 'schedule.allowOverlap': 'false' }}
    command={v => { const fields = { title: v.title, description: v.description, projectId: v.projectId || null, estimatedMinutes: Number(v.estimatedMinutes), note: v.note, assigneeId:v.assigneeId||null, parentTaskId:parent?.id??null }; return task ? { type: 'task.update', id: task.id, ...fields } : { type: 'task.create', ...fields, ...(v.scheduled === 'yes' ? { schedule: { date: v['schedule.date'], startMinute: minute(v['schedule.startMinute']), endMinute: minute(v['schedule.startMinute']) + Number(v.estimatedMinutes), allowOverlap: v['schedule.allowOverlap'] === 'true' } } : {}) }; }}
    validate={(v): Values => !parent && !v.projectId ? { projectId: 'Every task belongs to a project.' } : !task && v.scheduled === 'yes' ? Number(v.estimatedMinutes)<1?{estimatedMinutes:'Add an estimate to choose an initial time block.'}:minute(v['schedule.startMinute']) + Number(v.estimatedMinutes) > 1440 ? { 'schedule.startMinute': 'The estimate crosses midnight. Choose an earlier start or a shorter estimate.' } : {} : {}}
    message={task ? 'Task updated.' : 'Task created.'} done={app.onDone ?? app.onClose}>
    {d => <>{parent&&<p className="task-parent-hint">Subtask of {parent.title}. Project follows the parent.</p>}{d.field('title', 'Task title')}{d.field('description', 'Short description (optional)', { hint: 'One line workers see in their day list. Details go in the note.' })}{!parent&&d.field('projectId', 'Project', { options: [{ value: '', label: 'Choose a project' }, ...app.snapshot.projects.map(p => ({ value: p.id, label: p.name }))] })}
      <div className="task-capture-choice"><span className="task-capture-label">Assign to <small>optional</small></span><div className="task-assignee-choices" role="group" aria-label="Quick assignment"><button type="button" aria-pressed={!d.values.assigneeId} onClick={()=>d.set('assigneeId','')}>{parent?'Inherit':'Unassigned'}</button>{(app.snapshot.team??[]).filter(member=>!member.disabledAt||member.id===task?.assigneeId).map(member=><button type="button" key={member.id} aria-pressed={d.values.assigneeId===member.id} onClick={()=>d.set('assigneeId',member.id)}><span aria-hidden="true">{member.name.slice(0,1).toLocaleUpperCase()}</span>{member.name}</button>)}</div></div>
      <div className="task-capture-choice"><span className="task-capture-label">Time estimate <small>optional</small></span><div className="task-estimate-choices" role="group" aria-label="Quick time estimate">{[15,30,60,120,240].map(minutes=><button key={minutes} type="button" aria-pressed={Number(d.values.estimatedMinutes)===minutes} onClick={()=>d.set('estimatedMinutes',Number(d.values.estimatedMinutes)===minutes?'':String(minutes))}>{minutes<60?minutes+'m':minutes/60+'h'}</button>)}<button type="button" onClick={event=>{const form=event.currentTarget.closest('form'),details=form?.querySelector('details');if(details)details.open=true;form?.querySelector<HTMLInputElement>('input[name="estimatedMinutes"]')?.focus();}}>Custom</button></div></div>
      <details className="task-editor-details" open={Boolean(task)}><summary><span>More task details</span><ChevronDown size={17} aria-hidden="true"/></summary><p className="work-detail-hint">Assignment, estimate, notes and schedule are optional.</p>{d.field('assigneeId','Responsible person (optional)',{options:[{value:'',label:parent?'Inherit from parent':'Unassigned'},...(app.snapshot.team??[]).filter(member=>!member.disabledAt||member.id===task?.assigneeId).map(member=>({value:member.id,label:member.name+(member.disabledAt?' (inactive)':'')}))]})}
      {d.field('estimatedMinutes', 'Estimated minutes (optional)', { type: 'number', hint: 'Leave blank until you know. Up to 1440 minutes; editing never moves a saved plan.' })}{d.field('note', 'Task note (optional)', { type: 'textarea' })}
      {!task && <>{d.field('scheduled', 'Plan this task now?', { options: [{ value: 'no', label: 'No initial plan' }, { value: 'yes', label: 'Choose date and start' }] })}
        {d.values.scheduled === 'yes' && <>{d.field('schedule.date', 'Planned date', { type: 'date' })}{d.field('schedule.startMinute', 'Start time', { type: 'time', hint: 'Business time America/New_York. Block length equals the estimate.' })}
          {app.snapshot.schedule.some(b => b.date === d.values['schedule.date'] && b.startMinute < minute(d.values['schedule.startMinute']) + Number(d.values.estimatedMinutes) && minute(d.values['schedule.startMinute']) < b.endMinute) && <p role="alert">This time overlaps another plan. Saving requires an explicit overlap choice.</p>}
          {d.field('schedule.allowOverlap', 'Overlap choice', { options: [{ value: 'false', label: 'Do not allow overlap' }, { value: 'true', label: 'Save with overlap' }] })}</>}
      </>}</details>
    </>}
  </WorkForm></WorkDialog>;
}

type Action = { title: string; command: BusinessCommand; correction?: string };
export function TimerControls(app: ModuleProps) {
  const [selectedId,setSelected]=useState<string|null>(null),[action,setAction]=useState<Action|null>(null);
  const now=useServerNow(app.snapshot),timer=app.snapshot.runningTimer;
  const suggested=app.selection?.taskId??timer?.taskId??app.snapshot.tasks.find(task=>!task.archivedAt&&task.status==='open'&&(!task.assigneeId||task.assigneeId===app.snapshot.currentUser?.id))?.id??'';
  const selected=selectedId??suggested,task=app.snapshot.tasks.find(item=>item.id===selected&&!item.archivedAt);
  const activeTask=app.snapshot.tasks.find(item=>item.id===timer?.taskId),badClock=Boolean(timer&&now<timer.startedAt),total=task?actualMilliseconds(app.snapshot,task.id,now):0;
  const statusAction=(status:'open'|'blocked'|'done',title:string)=>task&&setAction({title,command:{type:'task.setStatus',id:task.id,status,expectedSessionId:status!=='open'&&timer&&(timer.taskId===task.id||status==='done'&&app.snapshot.tasks.some(child=>child.id===timer.taskId&&child.parentTaskId===task.id))?timer.sessionId:null}});
  return <section className={'work-module work-timer '+(timer?'is-running':'')} aria-label="Timer controls"><div className="work-section-heading"><div className="work-section-title"><h2>Work timer</h2></div><span className={'timer-status '+(timer?'timer-status-running':'')}><span aria-hidden="true"/>{timer?'Running':'Ready when you are'}</span></div>
    <label className="work-field timer-task-picker"><span className="visually-hidden">Selected task</span><select value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose a task</option>{app.snapshot.tasks.filter(item=>!item.archivedAt).map(item=><option key={item.id} value={item.id}>{item.title}{item.status==='done'?' · Complete':''}</option>)}</select></label>
    {timer&&timer.taskId!==task?.id&&<button className="timer-active-task" onClick={()=>activeTask&&app.onOpenTask(activeTask.id)}>Running: {activeTask?.title??'Active task'}<ChevronRight size={16} aria-hidden="true"/></button>}
    <div className="timer-face"><p className="work-clock">{badClock?'Clock correction needed':timer?formatClock(now-timer.startedAt):'00:00:00'}</p><span className="timer-logged">{task?(total===null?'Clock correction needed':formatDuration(total??0)+' logged on this task'):'Choose a task to begin.'}</span></div>
    {!app.snapshot.tasks.some(item=>!item.archivedAt)&&<button className="work-link-button" onClick={()=>app.onAddTask(null)}><Plus size={16} aria-hidden="true"/>Add your first task</button>}
    {badClock&&<p role="alert">The server clock is earlier than the saved start. Correct the start or explicitly discard the active session before stopping.</p>}
    <div className="work-actions timer-primary-actions">{task?.status==='open'&&timer?.taskId!==task.id&&<button className="work-primary" onClick={()=>setAction(timer?{title:'Switch timer',command:{type:'timer.switch',taskId:task.id,expectedSessionId:timer.sessionId}}:{title:'Start timer',command:{type:'timer.start',taskId:task.id}})}><Play size={17} aria-hidden="true"/>{timer?'Switch timer':'Start timer'}</button>}{timer&&<button className="work-primary" disabled={badClock} onClick={()=>setAction({title:'Pause timer',command:{type:'timer.pause',expectedSessionId:timer.sessionId}})}><Pause size={17} aria-hidden="true"/>Pause timer</button>}{task?.status==='open'&&<button disabled={badClock&&timer?.taskId===task.id} onClick={()=>statusAction('done','Finish task')}><Check size={17} aria-hidden="true"/>Finish task</button>}{task&&task.status!=='open'&&<button onClick={()=>statusAction('open','Reopen task')}>Reopen task</button>}</div>
    {(task||timer)&&<details className="timer-more"><summary>More timer actions<ChevronDown size={15} aria-hidden="true"/></summary><p>Your timer keeps running when the app is closed. Only you can pause or finish it.</p><div className="work-actions">{task?.status==='open'&&<button disabled={badClock&&timer?.taskId===task.id} onClick={()=>statusAction('blocked','Block task')}>Block task</button>}{timer&&<><button onClick={()=>setAction({title:'Correct timer start',correction:new Date(timer.startedAt).toISOString(),command:{type:'timer.correctStart',expectedSessionId:timer.sessionId,startedAt:timer.startedAt}})}>Correct timer start</button><button onClick={()=>setAction({title:'Discard timer',command:{type:'timer.discard',expectedSessionId:timer.sessionId}})}>Discard timer</button></>}</div></details>}
    {action&&<WorkDialog title={action.title} onClose={()=>setAction(null)}><WorkForm app={app} initial={{startedAt:action.correction??''}} command={values=>action.command.type==='timer.correctStart'?{...action.command,startedAt:timestamp(values.startedAt)}:action.command} message={action.title+' saved.'} done={()=>setAction(null)} submitLabel={'Confirm '+action.title.toLowerCase()}>{draft=><>{action.command.type==='task.setStatus'&&action.command.status==='done'&&<p>Complete this task and all its remaining subtasks. Your running timer on this work will be saved and stopped.</p>}{action.command.type==='timer.switch'&&<p>Close the observed running session for {activeTask?.title} and start {task?.title} together?</p>}{action.command.type==='timer.discard'&&<p>Discard the observed active session without saving its elapsed time? Previous entries remain.</p>}{action.command.type==='timer.correctStart'?<>{draft.field('startedAt','Corrected start (ISO timestamp)',{hint:'Include timezone, for example 2026-09-17T13:00:00.000Z. Server time: '+new Date(app.snapshot.serverNow).toISOString()})}</>:<p>Confirm this change. If work changed on another device, refresh and review before trying again.</p>}</>}</WorkForm></WorkDialog>}
  </section>;
}

export function TimeEntriesView(app: ModuleProps) {
  const [editing, setEditing] = useState<TimeEntry | 'new' | null>(null);
  const entries = app.snapshot.timeEntries.filter(e => !app.selection?.taskId || e.taskId === app.selection.taskId);
  const entry = editing && editing !== 'new' ? editing : null;
  const total = entries.reduce((sum, e) => sum + entryMilliseconds(e), 0);
  return <section className="work-module" aria-label="Time entries"><h2>Time entries</h2><p>Recorded total: {formatDuration(total)}</p><button onClick={() => setEditing('new')}>Add manual time</button>
    {!entries.length && <p>No recorded time yet.</p>}
    {entries.map(e => <article key={e.id}><h3>{app.snapshot.tasks.find(t => t.id === e.taskId)?.title}</h3><p>{e.source === 'manual' ? e.date + ' · Manual' : new Date(e.startedAt).toISOString() + ' → ' + new Date(e.endedAt).toISOString()}</p><p>{formatDuration(entryMilliseconds(e))}</p><p>{e.note}</p><button onClick={() => setEditing(e)}>Correct entry</button></article>)}
    {editing && <WorkDialog title={entry ? 'Correct time entry' : 'Add manual time'} onClose={() => setEditing(null)}><WorkForm app={app}
      initial={{ taskId: entry?.taskId ?? app.selection?.taskId ?? app.snapshot.tasks[0]?.id ?? '', date: entry?.source === 'manual' ? entry.date : app.businessDate, minutes: String(entry?.source === 'manual' ? entry.durationSeconds / 60 : 30), note: entry?.note ?? '', 'correction.startedAt': entry?.source === 'timer' ? new Date(entry.startedAt).toISOString() : '', 'correction.endedAt': entry?.source === 'timer' ? new Date(entry.endedAt).toISOString() : '' }}
      command={v => entry ? { type: 'timeEntry.correct', id: entry.id, correction: entry.source === 'manual' ? { source: 'manual', date: v.date, minutes: Number(v.minutes), note: v.note } : { source: 'timer', startedAt: timestamp(v['correction.startedAt']), endedAt: timestamp(v['correction.endedAt']), note: v.note } } : { type: 'timeEntry.createManual', taskId: v.taskId, date: v.date, minutes: Number(v.minutes), note: v.note }}
      validate={v => { const errors: Record<string, string> = {}; if (entry?.source !== 'timer') { if (!Number.isInteger(Number(v.minutes)) || Number(v.minutes) < 1 || Number(v.minutes) > 1440) errors.minutes = 'Enter 1–1440 whole minutes.'; if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) errors.date = 'Enter a valid work date.'; } return errors; }}
      message={entry ? 'Time entry corrected.' : 'Manual time saved.'} done={() => setEditing(null)}>
      {d => <>{entry ? <p>Correcting the existing {entry.source} entry for {app.snapshot.tasks.find(t => t.id === entry.taskId)?.title}. Its identity, task and source stay the same.</p> : d.field('taskId', 'Task', { options: [{ value: '', label: 'Choose a task' }, ...app.snapshot.tasks.map(t => ({ value: t.id, label: t.title }))] })}
        {entry?.source === 'timer' ? <>{d.field('correction.startedAt', 'Start (ISO timestamp)', { hint: 'Include Z or an explicit timezone offset.' })}{d.field('correction.endedAt', 'End (ISO timestamp)', { hint: 'Keep real dates for work across midnight.' })}</> : <>{d.field('date', 'Work date', { type: 'date' })}{d.field('minutes', 'Whole minutes', { type: 'number' })}</>}{d.field('note', 'Time note (optional)', { type: 'textarea' })}</>}
    </WorkForm></WorkDialog>}
  </section>;
}

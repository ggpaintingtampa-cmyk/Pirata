import { can } from '@pirata/contracts/permissions';
import { useState } from 'react';
import { ArrowUpRight, CheckCheck, ChevronRight, CornerDownRight, FolderOpen, ListChecks, Plus, Sparkles, Target } from 'lucide-react';
import type { Task } from '@pirata/contracts/index';
import { completionPercent, dailyCompletion, projectCompletion, taskCompletion } from '@pirata/contracts/progress';
import type { ModuleProps } from '../../services/moduleProps';
import { CompletionRing, QuickTaskCapture, TaskCheck, TaskChecklist, TimerControls } from '../tasks-time';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { WorkForm } from '../tasks-time/WorkForm';
import { defaultWorkFilters, groupWorkTasks, selectWorkTasks, type WorkTaskFilters } from './myTasks';
import './styles.css';

export function DailyPlanEditor({ app, userId, date, onClose }: { app:ModuleProps; userId:string; date:string; onClose():void }) {
  const previous=(app.snapshot.dailyGoals??[]).filter(goal=>goal.date===date&&goal.userId===userId).sort((a,b)=>a.position-b.position);
  const tasks=app.snapshot.tasks.filter(task=>!task.parentTaskId&&!task.archivedAt&&(!task.assigneeId||task.assigneeId===userId||previous.some(goal=>goal.taskId===task.id)));
  return <WorkDialog title="Choose daily goals" onClose={onClose}><WorkForm app={app} initial={{goal0:previous[0]?.taskId??'',goal1:previous[1]?.taskId??'',goal2:previous[2]?.taskId??''}} command={v=>({type:'dailyGoal.replace',date,userId,taskIds:[v.goal0,v.goal1,v.goal2].filter(Boolean)})} message="Daily plan saved." done={onClose}>
    {d=><><p>Choose up to three big goals for {date}. Each goal counts equally. New tasks never change this plan automatically.</p>{[0,1,2].map(index=>d.field('goal'+index,'Goal '+(index+1),{options:[{value:'',label:'No goal selected'},...tasks.map(task=>({value:task.id,label:task.title}))]}))}<p>Changing goals or their subtasks can raise or lower the percentage to show the current plan.</p></>}
  </WorkForm></WorkDialog>;
}

function CompletionBar({ fraction, label, goalCount }: { fraction:number|null; label:string; goalCount?:number }) {
  return fraction===null?<div className="work-goal-empty"><span className="work-empty-icon"><Target size={24} aria-hidden="true"/></span><div><h3>A little focus goes a long way.</h3><p>Choose a few meaningful goals to begin your day.</p></div></div>:<div className="completion-display"><CompletionRing fraction={fraction} label={label}/><div className="completion-copy"><h3>{fraction===1?'A day well done.':'Good work, one step at a time.'}</h3><span className="completion-caption">{goalCount?`${goalCount} ${goalCount===1?'goal':'goals'} · equally weighted`:'Your current daily plan'}</span></div></div>;
}

function MyTaskRow({ app, task, onAssign }: { app:ModuleProps; task:Task; onAssign?: (task:Task)=>void }) {
  const parent=task.parentTaskId?app.snapshot.tasks.find(item=>item.id===task.parentTaskId):undefined;
  const project=app.snapshot.projects.find(item=>item.id===(task.projectId??parent?.projectId));
  return <div className={'work-my-task-row'+(parent?' work-my-subtask':'')}>
    <span className="work-my-task-context">
      <span>{project?.name??'No project'}</span>
      {parent&&<><span aria-hidden="true">·</span><span className="work-my-task-parent"><CornerDownRight size={13} aria-hidden="true"/>Subtask of {parent.title}</span></>}
    </span>
    <TaskCheck app={app} task={task}/>
    {onAssign&&<button className="work-row-assignment" aria-label={'Reassign '+task.title} onClick={()=>onAssign(task)}>Assign: {app.snapshot.team?.find(person=>person.id===task.assigneeId)?.name??(task.assigneeId?'Unavailable member':'Unassigned')}{parent&&!task.assignmentExplicit?' · inherited':''}<ChevronRight size={14} aria-hidden="true"/></button>}
  </div>;
}

function MyTasksSection({ app, userId }: { app:ModuleProps; userId:string }) {
  const [filters,setFilters]=useState<WorkTaskFilters>(defaultWorkFilters);
  const [assignmentDraft,setAssigning]=useState<Task|null>(null);
  // Keep the dialog through refresh/retry, but use reviewed current fields after a conflict.
  const assigning=assignmentDraft?(app.snapshot.tasks.find(task=>task.id===assignmentDraft.id)??assignmentDraft):null;
  const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
  const owner=can(app.snapshot.currentUser?.role,'plan.others');
  const tasks=selectWorkTasks(app.snapshot,app.businessDate,filters);
  const groups=owner?groupWorkTasks(app.snapshot,tasks):[{id:userId,name:'Your tasks',tasks}].filter(group=>group.tasks.length);
  const setFilter=<K extends keyof WorkTaskFilters>(key:K,value:WorkTaskFilters[K])=>setFilters(previous=>({...previous,[key]:value}));
  const filtered=Object.keys(defaultWorkFilters).some(key=>filters[key as keyof WorkTaskFilters]!==defaultWorkFilters[key as keyof WorkTaskFilters]);
  const parent=assigning?.parentTaskId?app.snapshot.tasks.find(task=>task.id===assigning.parentTaskId):undefined;
  return <section className="work-my-tasks" aria-labelledby="work-my-tasks-title">
    <div className="work-section-heading">
      <div className="work-section-title"><ListChecks size={20} aria-hidden="true"/><h2 id="work-my-tasks-title">{owner?'Team tasks':'My tasks'}</h2><span className="work-count" aria-live="polite">{tasks.length}</span></div>
      <div className="work-task-toggle" role="group" aria-label="Work task view"><button aria-pressed={filters.scope==='assigned'} onClick={()=>setFilter('scope','assigned')}>{owner?'All assignments':'Assigned to me'}</button><button aria-pressed={filters.scope==='today'} onClick={()=>setFilter('scope','today')}>Today</button></div>
    </div>
    <p className="work-section-description">{filters.scope==='today'?'Today’s goals and scheduled tasks, including their subtasks.':owner?'Everyone’s assigned work and unassigned tasks, all in one place.':'All work assigned to you, including subtasks and work planned for another day.'}</p>
    <div className="work-task-toolbar">
      <label className="work-field work-task-search">Search tasks<input type="search" placeholder="Task, project or note" value={filters.query} onChange={event=>setFilter('query',event.target.value)}/></label>
      <label className="work-field">Project<select aria-label="Project" value={filters.project} onChange={event=>setFilter('project',event.target.value)}><option value="all">All projects</option><option value="unfiled">Unfiled tasks</option>{app.snapshot.projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      {owner&&<label className="work-field">Person<select aria-label="Person" value={filters.person} onChange={event=>setFilter('person',event.target.value)}><option value="all">Everyone</option><option value="unassigned">Unassigned only</option>{(app.snapshot.team??[]).map(person=><option key={person.id} value={person.id}>{person.name}{person.disabledAt!=null?' (inactive)':''}</option>)}</select></label>}
    </div>
    <div className="work-task-results"><div className="work-task-toggle" role="group" aria-label="Work task status">{(['active','done','all'] as const).map(status=><button key={status} aria-pressed={filters.status===status} onClick={()=>setFilter('status',status)}>{status==='active'?'Active':status==='done'?'Completed':'All'}</button>)}</div>{filtered&&<button className="work-link-button" onClick={()=>setFilters(defaultWorkFilters)}>Reset filters</button>}</div>
    <div className="work-my-task-groups">
      {groups.map(group=><div key={group.id} className="work-my-task-group"><button className="work-my-task-group-heading" aria-expanded={!collapsed.has(group.id)} aria-controls={'work-group-'+group.id} onClick={()=>setCollapsed(previous=>{const next=new Set(previous);if(next.has(group.id))next.delete(group.id);else next.add(group.id);return next;})}><span>{group.name}</span><span>{group.tasks.length}<ChevronRight size={16} aria-hidden="true"/></span></button><div id={'work-group-'+group.id} hidden={collapsed.has(group.id)}><div className="work-my-task-list">{group.tasks.map(task=><MyTaskRow key={task.id} app={app} task={task} onAssign={owner?setAssigning:undefined}/>)}</div></div></div>)}
    </div>
    {!tasks.length&&<p className="work-my-task-empty">{filters.scope==='today'?'No matching work planned for today. Check all assignments or adjust the daily plan.':'No tasks match these filters. Try another project, person or status.'}</p>}
    {assigning&&owner&&<WorkDialog title="Assign task" onClose={()=>setAssigning(null)}><WorkForm app={app} initial={{assigneeId:parent&&!assigning.assignmentExplicit?'':assigning.assigneeId??''}} command={values=>({type:'task.update',id:assigning.id,title:assigning.title,projectId:assigning.projectId,estimatedMinutes:assigning.estimatedMinutes,note:assigning.note,parentTaskId:assigning.parentTaskId??null,assigneeId:values.assigneeId||null})} message="Assignment updated." done={()=>setAssigning(null)}>{draft=><><p>{assigning.title}</p>{draft.field('assigneeId','Responsible person',{options:[{value:'',label:parent?'Inherit from '+parent.title:'Unassigned'},...(app.snapshot.team??[]).filter(person=>person.disabledAt==null||person.id===assigning.assigneeId).map(person=>({value:person.id,label:person.name+(person.disabledAt!=null?' (inactive)':'')}))]})}<p>{parent?'Inherit keeps this subtask with the parent’s responsible person.':'Subtasks that inherit this assignment will move with the task. Explicit subtask assignments stay as chosen.'} Running timers and daily goals stay unchanged.</p></>}</WorkForm></WorkDialog>}
  </section>;
}

export function WorkView(app: ModuleProps & { onOpenProjects?():void; onOpenTasks?():void }) {
  const [planning,setPlanning]=useState(false), person=app.snapshot.currentUser;
  const goals=(app.snapshot.dailyGoals??[]).filter(goal=>goal.userId===person?.id&&goal.date===app.businessDate).sort((a,b)=>a.position-b.position);
  const fraction=dailyCompletion(goals.map(goal=>goal.taskId),app.snapshot.tasks);
  const current=app.snapshot.tasks.find(task=>task.id===app.snapshot.runningTimer?.taskId);
  const projects=app.snapshot.projects.filter(project=>project.status!=='completed');
  const unfiled=app.snapshot.tasks.filter(task=>!task.archivedAt&&!task.parentTaskId&&!task.projectId&&task.status!=='done'&&!goals.some(goal=>goal.taskId===task.id)&&(!task.assigneeId||task.assigneeId===person?.id));
  return <div className="work-home work-module">
    <div className="work-focus-grid"><section className="daily-success" aria-label="Daily progress"><div className="work-section-heading"><div className="work-section-title"><h2>Today’s goals</h2></div>{goals.length>0&&<span className="work-small-label">{goals.length} {goals.length===1?'goal':'goals'} · equally weighted</span>}</div>
      {fraction===null?<CompletionBar fraction={fraction} label="Daily completion"/>:<div className="daily-goal-progress"><CompletionRing fraction={fraction} label="Daily completion"/><div className="work-daily-checklist">{goals.map(goal=>{const task=app.snapshot.tasks.find(item=>item.id===goal.taskId);return task?<TaskCheck key={goal.id} app={app} task={task}/>:null;})}</div></div>}
      {person&&<button className={goals.length?'work-plan-button':'work-plan-button work-primary'} onClick={()=>setPlanning(true)}>{goals.length?<ListChecks size={17} aria-hidden="true"/>:<Plus size={17} aria-hidden="true"/>}{goals.length?'Adjust daily plan':'Choose daily goals'}<ChevronRight size={16} aria-hidden="true"/></button>}
    </section>
    <TimerControls {...app} selection={{taskId:current?.id??goals[0]?.taskId}}/>
    </div>
    {current&&<section className="work-current-checklist"><div className="work-section-heading"><div className="work-section-title"><ListChecks size={20} aria-hidden="true"/><h2>Next steps</h2></div><button className="work-link-button" onClick={()=>app.onOpenTask(current.parentTaskId??current.id)}>Open task<ArrowUpRight size={16} aria-hidden="true"/></button></div><TaskChecklist {...app} compact parentTaskId={current.parentTaskId??current.id} selection={{projectId:current.projectId??undefined}}/></section>}
    {person&&<MyTasksSection app={app} userId={person.id}/>}
    <section className="work-projects"><div className="work-section-heading"><div className="work-section-title"><FolderOpen size={20} aria-hidden="true"/><h2>Projects</h2><span className="work-count">{projects.length}</span></div>{app.onOpenProjects&&<button className="work-link-button" onClick={app.onOpenProjects}>All projects<ArrowUpRight size={16} aria-hidden="true"/></button>}</div>
      {!projects.length&&<div className="work-empty-state"><FolderOpen size={24} aria-hidden="true"/><div><h3>Give your next job a home.</h3><p>Create a project when you are ready to group your work. Tasks can stay unfiled in the meantime.</p></div></div>}
      <div className="work-project-grid">{projects.slice(0,3).map(project=>{const completion=projectCompletion(project.id,app.snapshot.tasks),client=app.snapshot.clients.find(item=>item.id===project.clientId);return <button key={project.id} onClick={()=>app.onOpenProject(project.id)}><span className="work-project-top"><span className="work-project-mark"><FolderOpen size={21} aria-hidden="true"/></span><ArrowUpRight size={18} aria-hidden="true"/></span><strong>{project.name}</strong><span className="work-project-client">{client?.name||project.clientName||'Ready to organize'}</span><span className="work-project-completion">{completion===null?'Ready for tasks':completionPercent(completion)+'% complete'}<ChevronRight size={15} aria-hidden="true"/></span>{completion!==null&&<progress value={completion} max={1} aria-label={project.name+' completion'}/>}</button>;})}</div>
    </section>
    <section className="work-quick-section"><div className="work-section-heading"><div className="work-section-title"><Sparkles size={19} aria-hidden="true"/><h2>Quick tasks</h2>{unfiled.length>0&&<span className="work-count">{unfiled.length}</span>}</div>{app.onOpenTasks&&<button className="work-link-button" onClick={app.onOpenTasks}>All tasks<ArrowUpRight size={16} aria-hidden="true"/></button>}</div><p className="work-section-description">Capture it now. Add the details when you’re ready.</p><QuickTaskCapture app={app}/><div className="work-quick-list">{unfiled.slice(0,5).map(task=><TaskCheck key={task.id} app={app} task={task}/>)}</div>{unfiled.length>5&&app.onOpenTasks&&<button className="work-more-tasks" onClick={app.onOpenTasks}>View all tasks<ChevronRight size={16} aria-hidden="true"/></button>}{!unfiled.length&&<p className="work-quiet-note"><CheckCheck size={16} aria-hidden="true"/>Your quick-task list is clear.</p>}</section>
    {planning&&person&&<DailyPlanEditor app={app} userId={person.id} date={app.businessDate} onClose={()=>setPlanning(false)}/>}
  </div>;
}

export function ProgressView(app: ModuleProps) {
  const [chosenDate,setDate]=useState<string|null>(null),[editing,setEditing]=useState<string|null>(null),date=chosenDate??app.businessDate;
  const team=(app.snapshot.team??[]).filter(person=>!person.disabledAt);
  const planned=team.map(person=>dailyCompletion((app.snapshot.dailyGoals??[]).filter(goal=>goal.userId===person.id&&goal.date===date).map(goal=>goal.taskId),app.snapshot.tasks)).filter((fraction):fraction is number=>fraction!==null);
  const average=planned.length?planned.reduce((sum,fraction)=>sum+fraction,0)/planned.length:null;
  const projects=app.snapshot.projects.filter(project=>project.status!=='completed');
  return <section className="work-module progress-team"><div className="work-section-heading"><h2 className="progress-section-label">Daily team progress</h2><label className="work-field">Progress date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
    <div className="progress-summary">{average!==null?<><CompletionRing fraction={average} label="Team daily completion" success/><div><h3>{average===1?'A day well done, together.':'Every step moves us forward.'}</h3><p>Average completion for {planned.length} {planned.length===1?'person':'people'} with daily goals on this date.</p></div></>:<div><h3>Make room for a good day.</h3><p>Choose daily goals below to start seeing the team’s progress.</p></div>}</div>
    <div className="progress-people">{(app.snapshot.team??[]).filter(person=>!person.disabledAt).map(person=>{
      const goals=(app.snapshot.dailyGoals??[]).filter(goal=>goal.userId===person.id&&goal.date===date).sort((a,b)=>a.position-b.position),fraction=dailyCompletion(goals.map(goal=>goal.taskId),app.snapshot.tasks);
      return <article key={person.id}><div className="work-section-title"><span className="progress-avatar" aria-hidden="true">{person.name.slice(0,1).toLocaleUpperCase()}</span><div><h3>{person.name}</h3><span className="work-small-label">{goals.length?`${goals.length} daily ${goals.length===1?'goal':'goals'}`:'Ready to plan'}</span></div></div><CompletionBar fraction={fraction} label="Daily completion" goalCount={goals.length}/><div className="progress-goals">{goals.map(goal=>{const task=app.snapshot.tasks.find(task=>task.id===goal.taskId);return task?<div key={goal.id}><button onClick={()=>app.onOpenTask(task.id)}>{task.title}</button><span>{completionPercent(taskCompletion(task,app.snapshot.tasks))}%</span></div>:null;})}</div><button className="work-plan-button" disabled={!date} onClick={()=>setEditing(person.id)}><ListChecks size={17} aria-hidden="true"/>{goals.length?'Adjust plan':'Choose goals'}</button></article>;
    })}</div>
    <section className="progress-projects" aria-label="Project breakdown"><h2 className="progress-section-label">Project breakdown</h2><p className="progress-project-hint">Current completion across each project’s main tasks and their checklists.</p>{projects.length===0?<p>Add a project when you’re ready to group your work.</p>:<div className="progress-project-list">{projects.map(project=>{const tasks=app.snapshot.tasks.filter(task=>task.projectId===project.id&&!task.parentTaskId&&!task.archivedAt),fraction=projectCompletion(project.id,app.snapshot.tasks);return <button key={project.id} onClick={()=>app.onOpenProject(project.id)}><span><strong>{project.name}</strong><small>{tasks.filter(task=>taskCompletion(task,app.snapshot.tasks)===1).length}/{tasks.length} tasks</small></span>{fraction===null?<small>Ready for its first task</small>:<><progress value={fraction} max={1} aria-label={project.name+' completion'}/><small>{completionPercent(fraction)}% complete</small></>}</button>;})}</div>}</section>
    {editing&&<DailyPlanEditor app={app} userId={editing} date={date} onClose={()=>setEditing(null)}/>}
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import { Anchor, CalendarDays, BriefcaseBusiness, Menu, MessageSquare, Bell, Plus, RefreshCw, X, Users, Settings2 } from 'lucide-react';
import { toLegacyState } from '@pirata/contracts/compatibility';
import type { BusinessSnapshot } from '@pirata/contracts/index';
import { businessDate } from '@pirata/domain/lib/dates';
import { attentionItems, todaysObjectives, initialTaskId } from '@pirata/domain/domain/selectors';
import type { ModuleProps } from '../services/moduleProps';
import { useServer } from '../state/serverContext';
import { SignIn } from './SignIn';
import { LiveDialogs, type Dialog } from './dialogs';
import { DataTools } from './DataTools';
import { ObjectivesCard } from '../features/today/ObjectivesCard';
import { CurrentTaskCard } from '../features/today/CurrentTaskCard';
import { ScheduleCard } from '../features/today/ScheduleCard';
import { AttentionCard } from '../features/today/AttentionCard';
import { SpendingCard } from '../features/today/SpendingCard';
import { ClientsView, ProjectsView, ProjectDetail } from '../features/clients-projects';
import { InventoryView } from '../features/inventory';
import { ExpensesView } from '../features/spending';
import { WorkView, ProgressView } from '../features/work';
import { CalendarView } from '../features/planning/CalendarView';
import { UpdatesView, ShoppingView, CleanupPanel, FilesView } from '../features/collaboration';
import { AskView } from '../features/ask';
import { TeamSettings, AISettingsView } from '../features/team';
import { WorkForm } from '../features/tasks-time/WorkForm';
import { TaskList } from '../features/tasks-time';
import { WorkspaceMenu, WorkspaceShortcuts, WorkspaceSidebar } from './WorkspaceNavigation';
import { navigationAllowed, readView, viewHref, type View } from './navigation';
export function LiveApp(){const {state}=useServer();return state.data?<Workspace snapshot={state.data}/>:<SignIn/>;}
function Workspace({snapshot}:{snapshot:BusinessSnapshot}){
 const isOwner=snapshot.currentUser?.role!=='employee';
 const {store,state,now}=useServer(),[view,setView]=useState<View>(()=>readView(window.location.hash,isOwner)),[dialog,setDialog]=useState<Dialog|null>(null),[chosenTask,setChosenTask]=useState<string|null>(null),[announcement,announce]=useState('');
 const opener=useRef<HTMLElement|null>(null),legacy=toLegacyState(snapshot),date=businessDate(now);
 const open=(d:Dialog|null,confirmedClose=false)=>{if(d&&dialog&&!confirmedClose&&!navigationAllowed()){announce('Finish the current save or resolve the draft before opening another task action.');return;}if(d&&!dialog)opener.current=document.activeElement as HTMLElement;if(!d)requestAnimationFrame(()=>opener.current?.isConnected?opener.current.focus({preventScroll:true}):document.getElementById('main')?.focus());setDialog(d);};
 const scrollArea=useRef<HTMLDivElement>(null),[settingsFormVersion,setSettingsFormVersion]=useState(0);
 const navigate=(v:View)=>{
  if(viewHref(v)===viewHref(view)){scrollArea.current?.scrollTo({top:0,behavior:'smooth'});return;}
  if(!navigationAllowed()){announce('Resolve the current save or keep editing before leaving this page.');return;}
  open(null);
  if(viewHref(v)!==viewHref(view))window.history.pushState(null,'',viewHref(v));
  setView(v);
 };
 useEffect(()=>{
  if(!window.location.hash||window.location.hash==='#main')window.history.replaceState(null,'',viewHref(view));
  scrollArea.current?.scrollTo({top:0,behavior:'instant'});
  document.getElementById('main')?.focus({preventScroll:true});
  const pop=()=>{
   const active=[...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);
   if(active){active.dispatchEvent(new Event('cancel',{cancelable:true}));window.history.pushState(null,'',viewHref(view));return;}
   if(!navigationAllowed()){window.history.pushState(null,'',viewHref(view));return;}
   setView(readView(window.location.hash,isOwner));
  };
  const unload=(event:BeforeUnloadEvent)=>{if(document.querySelector('[data-form-dirty="true"], [data-save-phase="saving"], [data-save-phase="uncertain"], [data-save-phase="saved"], [data-import-phase="busy"], [data-import-phase="uncertain"], [data-import-phase="saved"]'))event.preventDefault();};
  window.addEventListener('popstate',pop);window.addEventListener('beforeunload',unload);
  return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('beforeunload',unload);};
 },[view,isOwner]);
 const app:ModuleProps={service:store.service,snapshot,businessDate:date,refresh:store.refresh,onClose:()=>open(null),onSaved:announce,
  onOpenTask:id=>open({kind:'task',id}),onAddTask:projectId=>open({kind:'task-new',projectId:projectId??undefined}),onOpenExpense:id=>open({kind:'expense',id}),onAddExpense:projectId=>open({kind:'expense',projectId:projectId??undefined}),onOpenProject:id=>navigate({name:'project',id}),onOpenClient:id=>navigate({name:'clients',id})};
 const taskId=chosenTask??initialTaskId(legacy,date),task=legacy.tasks.find(t=>t.id===taskId)??null,timer=snapshot.runningTimer;
 const timerAction=(action:'start'|'pause'|'finish'|'clock')=>{
  if(action==='clock'&&timer){open({kind:'action',title:'Correct timer start',command:{type:'timer.correctStart',expectedSessionId:timer.sessionId,startedAt:timer.startedAt},description:'Correct the active start explicitly. To discard the session instead, use Discard active session in Menu.'});return;}
  if(!task)return;
  if(action==='start')open(timer&&timer.taskId!==task.id?{kind:'action',title:'Switch timer',command:{type:'timer.switch',taskId:task.id,expectedSessionId:timer.sessionId},description:'Pause the running task and start '+task.title+' together?'}:{kind:'action',title:'Start timer',command:{type:'timer.start',taskId:task.id},description:'Start work on '+task.title+'? It continues while the page is closed until paused.'});
  if(action==='pause'&&timer)open({kind:'action',title:'Pause timer',command:{type:'timer.pause',expectedSessionId:timer.sessionId},description:'Save this completed work interval and pause the timer?'});
  if(action==='finish')open({kind:'action',title:'Finish task',command:{type:'task.setStatus',id:task.id,status:'done',expectedSessionId:timer?.taskId===task.id?timer.sessionId:null},description:'Finish '+task.title+' and save its active interval? Its planned schedule and daily objective stay unchanged.'});
 };
 const title=({work:'Work',ask:'Ask',updates:'Updates',calendar:'Calendar',progress:'Progress',shopping:'Shopping',team:'Team accounts','ai-settings':'Ask settings',settings:'Settings',today:'Today',projects:'Projects',project:'Project',inventory:'Inventory',clients:'Clients',more:'Menu',spending:'Spending',tasks:'Tasks',files:'Files'})[view.name];
 const descriptions:Partial<Record<View['name'],string>>={work:`${Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(now))<12?'Good morning':Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(now))<17?'Good afternoon':'Good evening'}, ${snapshot.currentUser?.name??'team'}.`,ask:'Your business assistant, ready to help.',updates:'What’s happening across your team.',calendar:'Plan the work. See the whole team.',projects:'Every job, moving forward.',project:'The details that keep the job moving.',tasks:'Capture it. Plan it. Get it done.',more:'Your whole workspace, in one place.',progress:'Daily completion. Shared success.',files:'Photos and PDFs, all in one place.',settings:'Customize your workspace.',shopping:'Pick it up. Check it off.',inventory:'Know what you have. Keep it ready.',clients:'Good work starts with good relationships.'};
 useEffect(()=>{document.title=title+' · Morgan el Pirata';},[title]);
 const menuActive=!['work','ask','updates'].includes(view.name);
 return <div className="app-layout live-app"><a href="#main" className="skip-link" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus({preventScroll:true});}}>Skip to content</a><header className="brand-bar"><div className="brand-inner"><a className="brand" href={viewHref({name:'work'})} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate({name:'work'});}}><span className="brand-mark"><Anchor aria-hidden="true" size={22}/></span><span>Morgan <span className="brand-subtle">el Pirata</span><small>YOUR WORK, TOGETHER</small></span></a><button className="owner-label" aria-label="Your account" onClick={()=>navigate({name:'more'})}><span className="account-dot" aria-hidden="true"/><span>{isOwner?'Owner':'Team'}</span></button></div></header>
 <WorkspaceSidebar view={view} isOwner={isOwner} navigate={navigate}/>
 <div className="content-viewport" ref={scrollArea}><main id="main" className="page" tabIndex={-1}>
 <WorkspaceShortcuts view={view} navigate={navigate}/>
 {view.name!=='project'&&<><div className="page-title"><div><p className="eyebrow">{view.name==='work'?'YOUR WORKDAY':view.name==='more'?'EXPLORE YOUR WORKSPACE':'MORGAN EL PIRATA'}</p><h1>{title}<span className="heading-dot">.</span></h1></div><div className="today-date"><CalendarDays size={16} aria-hidden="true"/><time dateTime={date}>{new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric'}).format(now)}</time></div></div>
 {descriptions[view.name]&&<p className="page-caption">{descriptions[view.name]}</p>}</>}
 {state.status==='reauth'&&<div className="inline-warning" role="alert">Your sign-in expired. Your draft is retained. <a href="/" target="_blank" rel="noopener">Sign in in another tab</a>, then retry the same save.</div>}
 {state.error&&<div className="inline-warning" role="alert">{state.error}<button onClick={()=>void store.refresh().catch(()=>{})}><RefreshCw size={16} aria-hidden="true"/>Retry refresh</button></div>}
 {view.name==='work'&&<><WorkView {...app} onOpenProjects={()=>navigate({name:'projects'})} onOpenTasks={()=>navigate({name:'tasks'})}/><CleanupPanel app={app}/></>}{view.name==='ask'&&<AskView {...app}/>}{view.name==='updates'&&<UpdatesView {...app}/>}{view.name==='calendar'&&<CalendarView {...app}/>}{view.name==='progress'&&<ProgressView {...app}/>}{view.name==='shopping'&&<ShoppingView {...app}/>}{view.name==='files'&&<FilesView {...app}/>}{view.name==='team'&&isOwner&&<TeamSettings {...app}/>}{view.name==='ai-settings'&&isOwner&&<AISettingsView {...app}/>}{view.name==='settings'&&isOwner&&<section className="card"><h2>Workday settings</h2><WorkForm key={settingsFormVersion} includeCancel={false} app={app} initial={{end:String(Math.floor((snapshot.settings?.workdayEndMinute??1020)/60)).padStart(2,'0')+':'+String((snapshot.settings?.workdayEndMinute??1020)%60).padStart(2,'0')}} command={v=>({type:'settings.update',workdayEndMinute:Number(v.end.split(':')[0])*60+Number(v.end.split(':')[1])})} message="Workday settings saved." done={()=>setSettingsFormVersion(version=>version+1)}>{f=><>{f.field('end','End of workday',{type:'time',hint:'America/New_York. Existing cleanup deadlines remain fixed.'})}</>}</WorkForm></section>}
 {view.name==='settings'&&isOwner&&<div className="settings-links"><button onClick={()=>navigate({name:'team'})}><Users size={20}/><span>Team accounts<small>People, passwords and access</small></span></button><button onClick={()=>navigate({name:'ai-settings'})}><MessageSquare size={20}/><span>Ask settings & usage<small>Model, requests and spending allowance</small></span></button><button onClick={()=>navigate({name:'more'})}><Settings2 size={20}/><span>Account & data<small>Sign out, export and recovery tools</small></span></button></div>}
 {view.name==='today'&&<div className="today-grid"><div className="main-column"><ObjectivesCard objectives={todaysObjectives(legacy,date)} onEdit={()=>open({kind:'objectives'})}/><CurrentTaskCard state={legacy} task={task} now={now} onChoose={setChosenTask} onStart={()=>timerAction('start')} onPause={()=>timerAction('pause')} onFinish={()=>timerAction('finish')} onEdit={()=>task&&open({kind:'task',id:task.id})} onTime={()=>open({kind:'time',id:task?.id})} onAdd={()=>open({kind:'task-new'})} onClock={()=>timerAction('clock')}/><ScheduleCard state={legacy} date={date} onTask={id=>open({kind:'task',id})}/></div><div className="side-column"><AttentionCard items={attentionItems(legacy,date)} onView={item=>item.kind==='shortage'?open({kind:'material',id:legacy.materialRequirements.find(r=>r.id===item.id)?.materialId}):open({kind:item.kind==='lead'?'follow-up':'maintenance',id:item.id})}/>{isOwner&&<SpendingCard state={legacy} date={date} onAll={()=>navigate({name:'spending'})} onEdit={e=>open({kind:'expense',id:e.id})}/>}<p className="local-note">Saved in your private workspace. Updates refresh on focus and every 5 seconds.</p></div></div>}
 {view.name==='projects'&&<ProjectsView {...app}/>}{view.name==='project'&&<ProjectDetail key={view.id} {...app} selection={{projectId:view.id}} onClose={()=>navigate({name:'projects'})}/>}{view.name==='clients'&&<ClientsView key={view.id??'all'} {...app} selection={{clientId:view.id}}/>}{view.name==='inventory'&&<InventoryView {...app}/>}{view.name==='spending'&&isOwner&&<ExpensesView {...app}/>}{view.name==='tasks'&&<TaskList {...app}/>}
 {view.name==='more'&&<><WorkspaceMenu isOwner={isOwner} navigate={navigate} counts={{projects:snapshot.projects.filter(p=>p.status==='open').length,files:snapshot.attachments?.filter(f=>!f.removedAt).length??0}}/><section className="card"><div className="workspace-account"><span className="person-initial" aria-hidden="true">{snapshot.currentUser?.name.slice(0,1)}</span><div><h2>{snapshot.currentUser?.name}</h2><p>@{snapshot.currentUser?.username} · {isOwner?'Owner':'Team member'}</p></div></div><p>A running timer continues when you sign out.</p><button disabled={state.busy} onClick={()=>{if(document.querySelector('[data-import-phase=busy],[data-import-phase=uncertain],[data-import-phase=saved]')){announce('Resolve the pending import before signing out.');return;}void store.logout().catch(()=>{});}}>Sign out</button>{timer&&<button onClick={()=>open({kind:'action',title:'Discard active session',command:{type:'timer.discard',expectedSessionId:timer.sessionId},description:'Discard this active session without recording elapsed time? Completed time entries remain.'})}>Discard active session</button>}</section></>}
 {isOwner&&<div hidden={view.name!=='more'}><DataTools/></div>}</main></div><div className="action-bar"><div className="action-inner"><div className="live-announcement" role="status" aria-live="polite">{announcement&&<><span>{announcement}</span><button aria-label="Dismiss success message" onClick={()=>announce('')}><X size={16}/></button></>}</div><button className="add-button" onClick={()=>open({kind:'task-new',fromQuick:true,projectId:view.name==='project'?view.id:undefined})}><Plus size={18} aria-hidden="true"/>Add task</button></div></div><nav className="bottom-nav" aria-label="Main navigation"><div className="nav-inner">{([['work','Work',BriefcaseBusiness],['ask','Ask',MessageSquare],['updates','Updates',Bell],['more','Menu',Menu]] as const).map(([name,label,Icon])=><button key={name} className={'nav-item '+((view.name===name||(name==='more'&&menuActive))?'active':'')} aria-current={(view.name===name||(name==='more'&&menuActive))?'page':undefined} onClick={()=>navigate({name})}><Icon size={21} aria-hidden="true"/>{label}</button>)}</div></nav>
 
 {dialog&&<LiveDialogs key={JSON.stringify(dialog)} app={app} dialog={dialog} open={open} now={now}/>}
 </div>;
}

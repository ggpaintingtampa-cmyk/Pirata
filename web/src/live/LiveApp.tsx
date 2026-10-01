import { useEffect, useRef, useState } from 'react';
import { Anchor, CalendarDays, BriefcaseBusiness, Menu, MessageSquare, Bell, Plus, RefreshCw, X, Users, Settings2 , Link2 } from 'lucide-react';
import type { BusinessSnapshot } from '@pirata/contracts/index';
import { businessDate } from '@pirata/domain/lib/dates';
import { RefreshButton } from '../components/RefreshButton';
import { SelectionBar, SelectionProvider } from '../features/bulk';
import type { ModuleProps } from '../services/moduleProps';
import { createMutation } from '../services/api';
import { useServer } from '../state/serverContext';
import { can } from '../state/permissions';
import { useT, useLocale, tx, LOCALE_NAMES, type Locale } from '../i18n';
import { localeTag } from '../i18n/locale';
import { Languages } from 'lucide-react';
import { SignIn } from './SignIn';
import { LiveDialogs, type Dialog } from './dialogs';
import { DataTools } from './DataTools';
import { ClientsView, ProjectsView, ProjectDetail } from '../features/clients-projects';
import { InventoryView } from '../features/inventory';
import { ExpensesView } from '../features/spending';
import { WorkView, ProgressView } from '../features/work';
import { CalendarView } from '../features/planning/CalendarView';
import { UpdatesView, CleanupPanel, FilesView } from '../features/collaboration';
import { AskView } from '../features/ask';
import { TeamSettings, AISettingsView, TranslationSettingsView, ConnectionsView } from '../features/team';
import { WorkForm } from '../features/tasks-time/WorkForm';
import { TaskList } from '../features/tasks-time';
import { WorkBar } from '../features/work-bar/WorkBar';
import { ReportView } from '../features/report';
import { HoursView } from '../features/hours';
import { PayView } from '../features/pay';
import { InsightsView } from '../features/insights';
import { MaterialsView } from '../features/materials';
import { ToolsView } from '../features/tools';
import { TemplatesView } from '../features/templates';
import { TrashView } from '../features/trash';
import { InstallHint } from '../features/tools/InstallHint';
import { WorkspaceMenu, WorkspaceShortcuts, WorkspaceSidebar } from './WorkspaceNavigation';
import { navigationAllowed, readView, viewHref, type View } from './navigation';
export function LiveApp(){const {state}=useServer();return state.data?<Workspace snapshot={state.data}/>:<SignIn/>;}
function Workspace({snapshot}:{snapshot:BusinessSnapshot}){
 const t=useT(),locale=useLocale();
 const role=snapshot.currentUser?.role;
 const {store,state,now}=useServer(),[view,setView]=useState<View>(()=>readView(window.location.hash,role)),[dialog,setDialog]=useState<Dialog|null>(null),[announcement,announce]=useState('');
 const opener=useRef<HTMLElement|null>(null),date=businessDate(now);
 const open=(d:Dialog|null,confirmedClose=false)=>{if(d&&dialog&&!confirmedClose&&!navigationAllowed()){announce(tx('Finish the current save or resolve the draft before opening another task action.'));return;}if(d&&!dialog)opener.current=document.activeElement as HTMLElement;if(!d)requestAnimationFrame(()=>opener.current?.isConnected?opener.current.focus({preventScroll:true}):document.getElementById('main')?.focus());setDialog(d);};
 const scrollArea=useRef<HTMLDivElement>(null),[settingsFormVersion,setSettingsFormVersion]=useState(0);
 const navigate=(v:View)=>{
  if(viewHref(v)===viewHref(view)){scrollArea.current?.scrollTo({top:0,behavior:'smooth'});return;}
  if(!navigationAllowed()){announce(tx('Resolve the current save or keep editing before leaving this page.'));return;}
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
   setView(readView(window.location.hash,role));
  };
  const unload=(event:BeforeUnloadEvent)=>{if(document.querySelector('[data-form-dirty="true"], [data-save-phase="saving"], [data-save-phase="uncertain"], [data-save-phase="saved"], [data-import-phase="busy"], [data-import-phase="uncertain"], [data-import-phase="saved"]'))event.preventDefault();};
  window.addEventListener('popstate',pop);window.addEventListener('beforeunload',unload);
  return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('beforeunload',unload);};
 },[view,role]);
 const app:ModuleProps={service:store.service,snapshot,businessDate:date,refresh:store.refresh,onClose:()=>open(null),onSaved:announce,
  onOpenTask:id=>open({kind:'task',id}),onAddTask:projectId=>open({kind:'task-new',projectId:projectId??undefined}),onOpenExpense:id=>open({kind:'expense',id}),onAddExpense:projectId=>open({kind:'expense',projectId:projectId??undefined}),onOpenProject:id=>navigate({name:'project',id}),onOpenClient:id=>navigate({name:'clients',id})};
 const timer=snapshot.runningTimer;
 const setLocale=async(locale:Locale)=>{
  if(locale===(snapshot.currentUser?.locale??'en'))return;
  try{await store.service.execute(createMutation({type:'user.setLocale',locale},snapshot.revision));await store.refresh();announce(t('shell.language.saved'));}
  catch{announce(t('shell.language.failed'));}
 };
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(now));
 const title=t('shell.view.'+view.name);
 const description=view.name==='work'?t(hour<12?'shell.greeting.morning':hour<17?'shell.greeting.afternoon':'shell.greeting.evening',{name:snapshot.currentUser?.name??'team'}):(()=>{const key='shell.desc.'+view.name,text=t(key);return text===key?undefined:text;})();
 useEffect(()=>{document.title=title+' · Morgan el Pirata';},[title]);
 const menuActive=!['work','ask','updates'].includes(view.name);
 const roleLabel=t('shell.role.'+(role??'worker'));
 return <SelectionProvider><div className="app-layout live-app"><a href="#main" className="skip-link" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus({preventScroll:true});}}>{t('shell.skip')}</a><header className="brand-bar"><div className="brand-inner"><a className="brand" href={viewHref({name:'work'})} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate({name:'work'});}}><span className="brand-mark"><Anchor aria-hidden="true" size={22}/></span><span>Morgan <span className="brand-subtle">el Pirata</span><small>{t('shell.tagline')}</small></span></a><span className="brand-tools">{view.name==='project'&&<RefreshButton announce={announce}/>}<button className="owner-label" aria-label={t('shell.account')} onClick={()=>navigate({name:'more'})}><span className="account-dot" aria-hidden="true"/><span>{roleLabel}</span></button></span></div></header>
 <WorkspaceSidebar view={view} role={role} navigate={navigate}/>
 <div className="content-viewport" ref={scrollArea}><WorkBar app={app} onOpenTask={id=>open({kind:'task',id})}/><main id="main" className="page" tabIndex={-1}>
 <WorkspaceShortcuts view={view} navigate={navigate}/>
 {view.name!=='project'&&<><div className="page-title"><div><p className="eyebrow">{view.name==='work'?t('shell.eyebrow.work'):view.name==='more'?t('shell.eyebrow.more'):t('shell.eyebrow.default')}</p><h1>{title}<span className="heading-dot">.</span></h1></div><div className="today-date"><CalendarDays size={16} aria-hidden="true"/><time dateTime={date}>{new Intl.DateTimeFormat(localeTag(locale),{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric'}).format(now)}</time><RefreshButton announce={announce}/></div></div>
 {description&&<p className="page-caption">{description}</p>}</>}
 {state.error&&<div className="inline-warning" role="alert">{state.error}<button onClick={()=>void store.refresh().catch(()=>{})}><RefreshCw size={16} aria-hidden="true"/>{t('shell.retry')}</button></div>}
 {view.name==='work'&&<><WorkView {...app} onOpenProjects={()=>navigate({name:'projects'})} onOpenTasks={()=>navigate({name:'tasks'})} onOpenHours={date=>navigate({name:'hours',id:date})} onRequestMaterial={input=>open({kind:'registry',name:'material-request',projectId:input.projectId,id:input.taskId,prefill:{title:input.title,quantity:input.quantity}})}/><CleanupPanel app={app}/></>}{view.name==='ask'&&<AskView {...app}/>}{view.name==='updates'&&<UpdatesView {...app}/>}{view.name==='calendar'&&<CalendarView {...app} onAddShift={date=>open({kind:'registry',name:'shift',date})}/>}{view.name==='progress'&&<ProgressView {...app}/>}{view.name==='files'&&<FilesView {...app}/>}
 {view.name==='report'&&<ReportView {...app} date={view.id}/>}{view.name==='hours'&&<HoursView {...app} date={view.id}/>}{view.name==='pay'&&can(role,'money.costs')&&<PayView {...app}/>}{view.name==='insights'&&<InsightsView {...app} projectId={view.id}/>}{view.name==='materials'&&<MaterialsView {...app}/>}{view.name==='tools'&&<ToolsView {...app}/>}{view.name==='templates'&&<TemplatesView {...app}/>}{view.name==='trash'&&can(role,'records.delete')&&<TrashView {...app}/>}
 {view.name==='team'&&can(role,'team.admin')&&<TeamSettings {...app}/>}{view.name==='ai-settings'&&can(role,'ask.admin')&&<AISettingsView {...app}/>}{view.name==='translation-settings'&&can(role,'ask.admin')&&<TranslationSettingsView {...app}/>}{view.name==='connections'&&can(role,'integration.admin')&&<ConnectionsView {...app}/>}{view.name==='settings'&&can(role,'settings.admin')&&<section className="card"><h2>{t('shell.settings.workday')}</h2><WorkForm key={settingsFormVersion} includeCancel={false} app={app} initial={{end:String(Math.floor((snapshot.settings?.workdayEndMinute??1020)/60)).padStart(2,'0')+':'+String((snapshot.settings?.workdayEndMinute??1020)%60).padStart(2,'0')}} command={v=>({type:'settings.update',workdayEndMinute:Number(v.end.split(':')[0])*60+Number(v.end.split(':')[1])})} message={t('shell.settings.saved')} done={()=>setSettingsFormVersion(version=>version+1)}>{f=><>{f.field('end',t('shell.settings.workdayEnd'),{type:'time',hint:t('shell.settings.workdayHint')})}</>}</WorkForm><div className="language-toggle" role="group" aria-label={t('shell.account.language')}><span>{t('shell.account.language')}</span>{(['en','es'] as const).map(code=><button key={code} type="button" className={locale===code?'selected':''} aria-pressed={locale===code} disabled={state.busy} onClick={()=>void setLocale(code)}>{LOCALE_NAMES[code]}</button>)}</div></section>}
 {view.name==='settings'&&can(role,'settings.admin')&&<div className="settings-links"><button onClick={()=>navigate({name:'team'})}><Users size={20}/><span>{t('shell.settings.team')}<small>{t('shell.settings.team.desc')}</small></span></button><button onClick={()=>navigate({name:'ai-settings'})}><MessageSquare size={20}/><span>{t('shell.settings.ask')}<small>{t('shell.settings.ask.desc')}</small></span></button><button onClick={()=>navigate({name:'translation-settings'})}><Languages size={20}/><span>{t('shell.settings.translation')}<small>{t('shell.settings.translation.desc')}</small></span></button>{can(role,'integration.admin')&&<button onClick={()=>navigate({name:'connections'})}><Link2 size={20}/><span>{t('shell.settings.connections')}<small>{t('shell.settings.connections.desc')}</small></span></button>}<button onClick={()=>navigate({name:'more'})}><Settings2 size={20}/><span>{t('shell.settings.account')}<small>{t('shell.settings.account.desc')}</small></span></button></div>}
 {view.name==='projects'&&<ProjectsView {...app}/>}{view.name==='project'&&<ProjectDetail key={view.id} {...app} selection={{projectId:view.id}} onClose={()=>navigate({name:'projects'})}/>}{view.name==='clients'&&<ClientsView key={view.id??'all'} {...app} selection={{clientId:view.id}}/>}{view.name==='inventory'&&<InventoryView {...app}/>}{view.name==='spending'&&can(role,'money.costs')&&<ExpensesView {...app}/>}{view.name==='tasks'&&<TaskList {...app}/>}
 {view.name==='more'&&<><WorkspaceMenu role={role} navigate={navigate} counts={{projects:snapshot.projects.filter(p=>p.status!=='completed').length,files:snapshot.attachments?.filter(f=>!f.removedAt).length??0}}/><section className="card"><div className="workspace-account"><span className="person-initial" aria-hidden="true">{snapshot.currentUser?.name.slice(0,1)}</span><div><h2>{snapshot.currentUser?.name}</h2><p>@{snapshot.currentUser?.username} · {roleLabel}</p></div></div>
  <div className="language-toggle" role="group" aria-label={t('shell.account.language')}><span>{t('shell.account.language')}</span>{(['en','es'] as const).map(locale=><button key={locale} type="button" className={(snapshot.currentUser?.locale??'en')===locale?'selected':''} aria-pressed={(snapshot.currentUser?.locale??'en')===locale} disabled={state.busy} onClick={()=>void setLocale(locale)}>{LOCALE_NAMES[locale]}</button>)}</div>
  <InstallHint />
  <p>{t('shell.account.timerNote')}</p><button disabled={state.busy} onClick={()=>{if(document.querySelector('[data-import-phase=busy],[data-import-phase=uncertain],[data-import-phase=saved]')){announce(tx('Resolve the pending import before signing out.'));return;}void store.logout().catch(()=>{});}}>{t('shell.account.signOut')}</button>{timer&&<button onClick={()=>open({kind:'action',title:t('shell.discard.title'),command:{type:'timer.discard',expectedSessionId:timer.sessionId},description:t('shell.discard.desc')})}>{t('shell.account.discard')}</button>}</section></>}
 {can(role,'data.admin')&&<div hidden={view.name!=='more'}><DataTools/></div>}<SelectionBar app={app}/></main></div><div className="action-bar"><div className="action-inner"><div className="live-announcement" role="status" aria-live="polite">{announcement&&<><span>{announcement}</span><button aria-label={t('shell.dismiss')} onClick={()=>announce('')}><X size={16}/></button></>}</div><button className="add-button" onClick={()=>open({kind:'quick',projectId:view.name==='project'?view.id:undefined})}><Plus size={18} aria-hidden="true"/>{t('shell.add')}</button></div></div><nav className="bottom-nav" aria-label={t('shell.nav.main')}><div className="nav-inner">{([['work','shell.nav.work',BriefcaseBusiness],['ask','shell.nav.ask',MessageSquare],['updates','shell.nav.updates',Bell],['more','shell.nav.more',Menu]] as const).map(([name,labelKey,Icon])=><button key={name} className={'nav-item '+((view.name===name||(name==='more'&&menuActive))?'active':'')} aria-current={(view.name===name||(name==='more'&&menuActive))?'page':undefined} onClick={()=>navigate({name})}><Icon size={21} aria-hidden="true"/>{t(labelKey)}</button>)}</div></nav>
 {state.status==='reauth'&&<div className="reauth-overlay" role="dialog" aria-modal="true" aria-label={t('shell.reauth')}><p className="reauth-note">{t('shell.reauth')}</p><SignIn/></div>}
 {dialog&&<LiveDialogs key={JSON.stringify(dialog)} app={app} dialog={dialog} open={open} now={now}/>}
 </div></SelectionProvider>;
}

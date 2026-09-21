import { useState } from 'react';
import { BriefcaseBusiness, CalendarDays, CheckCheck, CircleDollarSign, ClipboardList, Clock3, Gauge, Folder, Files, MessageSquare, Search, Settings2, ShoppingBag, Users, Wrench, Bell, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { viewHref, type View, type ViewName } from './navigation';

interface Destination { name: ViewName; label: string; description: string; icon: LucideIcon; owner?: boolean; group: string }
const destinations: Destination[] = [
  { name:'projects', label:'Projects', description:'Jobs, checklists & files', icon:Folder, group:'Plan & work' },
  { name:'calendar', label:'Calendar', description:'See the day and week ahead', icon:CalendarDays, group:'Plan & work' },
  { name:'tasks', label:'All tasks', description:'Find, assign & finish work', icon:CheckCheck, group:'Plan & work' },
  { name:'progress', label:'Team Progress', description:'Each person’s daily goals', icon:Gauge, group:'Plan & work' },
  { name:'today', label:'Today', description:'Schedule, priorities & reminders', icon:Clock3, group:'Today' },
  { name:'clients', label:'Clients', description:'People, contacts & leads', icon:Users, group:'Your business' },
  { name:'inventory', label:'Inventory', description:'Materials, tools & cleanup', icon:Wrench, group:'Your business' },
  { name:'shopping', label:'Shopping', description:'What the team needs next', icon:ShoppingBag, group:'Your business' },
  { name:'spending', label:'Spending', description:'Purchases & project costs', icon:CircleDollarSign, group:'Your business', owner:true },
  { name:'files', label:'Files', description:'Photos, PDFs & project documents', icon:Files, group:'Files & team' },
  { name:'team', label:'Team accounts', description:'People, passwords & access', icon:Users, group:'Files & team', owner:true },
  { name:'ai-settings', label:'Ask settings & usage', description:'Model, allowance & usage', icon:MessageSquare, group:'Settings', owner:true },
  { name:'settings', label:'Workday settings', description:'Settings, finishing time & account', icon:Settings2, group:'Settings', owner:true },
];
const groups=['Plan & work','Today','Your business','Files & team','Settings'];
const primary = [
  { name:'work' as const, label:'Work', icon:BriefcaseBusiness },
  { name:'ask' as const, label:'Ask Morgan', icon:MessageSquare },
  { name:'updates' as const, label:'Updates', icon:Bell },
];
const selected = (view:View, name:ViewName) => view.name===name || (name==='projects' && view.name==='project');
interface Props { view:View; isOwner:boolean; navigate(view:View):void; counts?:Partial<Record<ViewName,number>> }

export function WorkspaceSidebar({view,isOwner,navigate}:Props) {
  return <aside className="workspace-sidebar"><nav aria-label="Workspace navigation">
    <div className="sidebar-primary">{primary.map(({name,label,icon:Icon})=><a key={name} href={viewHref({name})} className={selected(view,name)?'selected':''} aria-current={selected(view,name)?'page':undefined} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate({name});}}><Icon size={19} aria-hidden="true"/>{label}</a>)}</div>
    {groups.map(group=>{
      const links=destinations.filter(item=>item.group===group&&(!item.owner||isOwner));
      return links.length?<div className="sidebar-group" key={group}><p>{group}</p>{links.map(({name,label,icon:Icon})=><a key={name} href={viewHref({name})} className={selected(view,name)?'selected':''} aria-current={selected(view,name)?'page':undefined} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate({name});}}><Icon size={18} aria-hidden="true"/>{label}</a>)}</div>:null;
    })}
    <a className={'sidebar-account '+(view.name==='more'?'selected':'')} href={viewHref({name:'more'})} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate({name:'more'});}}><Settings2 size={18} aria-hidden="true"/>Account & more<ChevronRight size={16} aria-hidden="true"/></a>
  </nav><p className="sidebar-footnote">A clear plan.<br/>Good work, together.</p></aside>;
}

export function WorkspaceShortcuts({view,navigate}:Pick<Props,'view'|'navigate'>) {
  return <div className="workspace-shortcuts" aria-label="Workspace shortcuts">{([
    ['projects','Projects',Folder],['calendar','Calendar',CalendarDays],['tasks','Tasks',ClipboardList],
  ] as const).map(([name,label,Icon])=><a key={name} href={viewHref({name})} className={selected(view,name)?'selected':''} aria-current={selected(view,name)?'page':undefined} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate({name});}}><Icon size={18} aria-hidden="true"/><span>{label}</span></a>)}</div>;
}

export function WorkspaceMenu({isOwner,navigate,counts}:Pick<Props,'isOwner'|'navigate'|'counts'>) {
  const [query,setQuery]=useState('');
  const items=destinations.filter(item=>(!item.owner||isOwner)&&`${item.label} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="workspace-directory" aria-label="Workspace sections">
    <label className="directory-search"><Search size={19} aria-hidden="true"/><span className="sr-only">Find a page</span><input type="search" placeholder="Find a page…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {groups.map(group=>{
      const links=items.filter(item=>item.group===group);
      return links.length?<section className="directory-group" key={group}><h2>{group}</h2><div className="directory-grid">{links.map(({name,label,description,icon:Icon})=><button key={name} aria-label={label} onClick={()=>navigate({name})}><span className="directory-icon"><Icon size={21} aria-hidden="true"/></span><span><strong>{label}</strong><small>{description}</small></span>{counts?.[name]!==undefined&&<span className="directory-count" aria-label={`${counts[name]} records`}>{counts[name]}</span>}<ChevronRight size={17} aria-hidden="true"/></button>)}</div></section>:null;
    })}
    {!items.length&&<p className="empty-state">No pages match “{query}”. Try projects, files, or settings.</p>}
  </section>;
}

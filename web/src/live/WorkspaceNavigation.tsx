import { useState } from 'react';
import { Languages, Trash2, BriefcaseBusiness, CalendarDays, CheckCheck, CircleDollarSign, ClipboardList, Clock3, Gauge, Folder, Files, LayoutTemplate, ClipboardCheck, MessageSquare, Search, Settings2, ShoppingBag, Users, Wrench, Bell, ChevronRight, Package } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Capability, Role } from '@pirata/contracts/permissions';
import { useT } from '../i18n';
import { viewAllowed, viewHref, type View, type ViewName } from './navigation';

interface Destination { name: ViewName; icon: LucideIcon; capability?: Capability; group: string }
/** Labels and descriptions come from shell strings: `shell.view.<name>` and `shell.view.<name>.desc`. */
const destinations: Destination[] = [
  { name:'work', icon:BriefcaseBusiness, group:'plan' },
  { name:'projects', icon:Folder, group:'plan' },
  { name:'calendar', icon:CalendarDays, group:'plan' },
  { name:'tasks', icon:CheckCheck, group:'plan' },
  { name:'templates', icon:LayoutTemplate, group:'plan' },
  { name:'report', icon:ClipboardCheck, group:'plan' },
  { name:'insights', icon:Gauge, group:'plan' },
  { name:'hours', icon:Clock3, group:'hours' },
  { name:'pay', icon:CircleDollarSign, group:'hours', capability:'money.costs' },
  { name:'clients', icon:Users, group:'business' },
  { name:'materials', icon:ShoppingBag, group:'business' },
  { name:'tools', icon:Wrench, group:'business' },
  { name:'inventory', icon:Package, group:'business' },
  { name:'spending', icon:CircleDollarSign, group:'business', capability:'money.costs' },
  { name:'files', icon:Files, group:'files' },
  { name:'team', icon:Users, group:'files', capability:'team.admin' },
  { name:'trash', icon:Trash2, group:'files', capability:'records.delete' },
  { name:'ai-settings', icon:MessageSquare, group:'settings', capability:'ask.admin' },
  { name:'translation-settings', icon:Languages, group:'settings', capability:'ask.admin' },
  { name:'settings', icon:Settings2, group:'settings', capability:'settings.admin' },
];
const groups=['plan','hours','business','files','settings'];
const primary = [
  { name:'work' as const, labelKey:'shell.nav.work', icon:BriefcaseBusiness },
  { name:'ask' as const, labelKey:'shell.nav.askLong', icon:MessageSquare },
  { name:'updates' as const, labelKey:'shell.nav.updates', icon:Bell },
];
const selected = (view:View, name:ViewName) => view.name===name || (name==='projects' && view.name==='project') || (name==='insights' && view.name==='insights');
interface Props { view:View; role:Role|undefined; navigate(view:View):void; counts?:Partial<Record<ViewName,number>> }
const allowed=(item:Destination,role:Role|undefined)=>viewAllowed(item.name,role);

export function WorkspaceSidebar({view,role,navigate}:Props) {
  const t=useT();
  return <aside className="workspace-sidebar"><nav aria-label={t('shell.menu.sections')}>
    <div className="sidebar-primary">{primary.map(({name,labelKey,icon:Icon})=><a key={name} href={viewHref({name})} className={selected(view,name)?'selected':''} aria-current={selected(view,name)?'page':undefined} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate({name});}}><Icon size={19} aria-hidden="true"/>{t(labelKey)}</a>)}</div>
    {groups.map(group=>{
      const links=destinations.filter(item=>item.group===group&&item.name!=='work'&&allowed(item,role));
      return links.length?<div className="sidebar-group" key={group}><p>{t('shell.group.'+group)}</p>{links.map(({name,icon:Icon})=><a key={name} href={viewHref({name})} className={selected(view,name)?'selected':''} aria-current={selected(view,name)?'page':undefined} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate({name});}}><Icon size={18} aria-hidden="true"/>{t('shell.view.'+name)}</a>)}</div>:null;
    })}
    <a className={'sidebar-account '+(view.name==='more'?'selected':'')} href={viewHref({name:'more'})} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate({name:'more'});}}><Settings2 size={18} aria-hidden="true"/>{t('shell.menu.accountMore')}<ChevronRight size={16} aria-hidden="true"/></a>
  </nav><p className="sidebar-footnote">{t('shell.menu.footnote').split('\n').map((line,i)=><span key={i}>{i>0&&<br/>}{line}</span>)}</p></aside>;
}

export function WorkspaceShortcuts({view,navigate}:Pick<Props,'view'|'navigate'>) {
  const t=useT();
  return <div className="workspace-shortcuts" aria-label={t('shell.menu.sections')}>{([
    ['projects',Folder],['calendar',CalendarDays],['tasks',ClipboardList],
  ] as const).map(([name,Icon])=><a key={name} href={viewHref({name})} className={selected(view,name)?'selected':''} aria-current={selected(view,name)?'page':undefined} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate({name});}}><Icon size={18} aria-hidden="true"/><span>{t('shell.view.'+name)}</span></a>)}</div>;
}

export function WorkspaceMenu({role,navigate,counts}:Pick<Props,'role'|'navigate'|'counts'>) {
  const t=useT();
  const [query,setQuery]=useState('');
  const items=destinations.filter(item=>allowed(item,role)&&`${t('shell.view.'+item.name)} ${t('shell.view.'+item.name+'.desc')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="workspace-directory" aria-label={t('shell.menu.sections')}>
    <label className="directory-search"><Search size={19} aria-hidden="true"/><span className="sr-only">{t('shell.menu.find')}</span><input type="search" placeholder={t('shell.menu.search')} value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {groups.map(group=>{
      const links=items.filter(item=>item.group===group);
      return links.length?<section className="directory-group" key={group}><h2>{t('shell.group.'+group)}</h2><div className="directory-grid">{links.map(({name,icon:Icon})=><button key={name} aria-label={t('shell.view.'+name)} onClick={()=>navigate({name})}><span className="directory-icon"><Icon size={21} aria-hidden="true"/></span><span><strong>{t('shell.view.'+name)}</strong><small>{t('shell.view.'+name+'.desc')}</small></span>{counts?.[name]!==undefined&&<span className="directory-count" aria-label={t('shell.menu.records',{count:counts[name]??0})}>{counts[name]}</span>}<ChevronRight size={17} aria-hidden="true"/></button>)}</div></section>:null;
    })}
    {!items.length&&<p className="empty-state">{t('shell.menu.noMatch',{query})}</p>}
  </section>;
}

import type { ReactNode } from 'react';
import { Anchor, CalendarDays, FolderOpen, Package, Users, Ellipsis, Plus, X } from 'lucide-react';
import { useApp } from '../state/AppProvider';
import { dateLabel } from '../lib/dates';
import { StorageNotice } from './StorageNotice';
export function AppShell({ children }: { children: ReactNode }) {
  const { date, setDialog, snapshot, announcement, setAnnouncement } = useApp();
  const editable = snapshot.mode === 'ready' || snapshot.mode === 'memory';
  return <div className="app-layout">
    <a className="skip-link" href="#main">Skip to Today</a>
    <header className="brand-bar"><div className="brand-inner"><a className="brand" href="#main"><span className="brand-mark"><Anchor size={23} /></span><span>Morgan <span className="brand-subtle">el Pirata</span></span></a><button className="demo-button" onClick={() => setDialog({ kind: 'demo' })}><span className="demo-dot" />Demo</button></div></header>
    <div className="content-viewport"><main id="main" className="page" tabIndex={-1}><div className="page-title"><div><h1>Today<span className="heading-dot">.</span></h1></div><div className="today-date"><CalendarDays size={18} /><span><time dateTime={date}>{dateLabel(date, true)}</time><small>America/New_York</small></span></div></div>
      <StorageNotice />
      {children}
      {announcement && <div className="success-banner"><span role="status">{announcement}</span><button className="icon-button" aria-label="Dismiss success message" onClick={() => setAnnouncement('')}><X size={18} /></button></div>}
    </main></div>
    <div className="action-bar"><div className="action-inner">{editable && <button className="add-button" onClick={() => setDialog({ kind: 'quick' })}><Plus size={23} />Add</button>}</div></div>
    <nav className="bottom-nav" aria-label="Main navigation"><div className="nav-inner">
      <button aria-current="page" className="nav-item active" onClick={() => document.getElementById('main')?.scrollIntoView({ block: 'start' })}><CalendarDays size={21} /><span>Today</span></button>
      {[{ name: 'Projects', Icon: FolderOpen }, { name: 'Inventory', Icon: Package }, { name: 'Clients', Icon: Users }, { name: 'More', Icon: Ellipsis }].map(({ name, Icon }) => <button key={name} className="nav-item" disabled aria-label={name + ' Upcoming'} title={name + ' — upcoming'}><Icon size={21} /><span>{name}</span><small>Planned</small></button>)}
    </div></nav>
  </div>;
}

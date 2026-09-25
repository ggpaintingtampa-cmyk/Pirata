import { can } from '@pirata/contracts/permissions';
import { useId, useState, type MouseEvent } from 'react';
import { ArrowLeft, Check, ChevronRight, Clock3, DollarSign, MapPin, Pencil, Plus, Search, User, Users } from 'lucide-react';
import type { Client, Lead, Project } from '@pirata/contracts/index';
import { formatMoney } from '@pirata/domain/lib/money';
import { formatDuration } from '@pirata/domain/lib/time';
import type { ModuleProps } from '../../services/moduleProps';
import { RecordModal } from './RecordModal';
import { ArchiveForm, ClientForm, ConvertForm, FollowUpForm, LeadForm, ProjectForm, ProjectStatusForm } from './forms';
import { projectSummary } from './projectSummary';
import './styles.css';
import { FilesPanel, ProjectNotesPanel, UpdatesPanel } from '../collaboration';
import { TaskChecklist } from '../tasks-time';
import { completionPercent, projectCompletion } from '@pirata/contracts/progress';

type DialogState =
  | { kind: 'client' | 'edit-client' | 'archive-client'; id: string }
  | { kind: 'lead' | 'edit-lead' | 'follow-up' | 'convert'; id: string }
  | { kind: 'edit-project' | 'project-status'; id: string }
  | { kind: 'new-client' | 'new-lead' }
  | { kind: 'new-project'; clientId?: string };
type OpenDialog = (dialog: DialogState | null) => void;
const due = (lead: Lead, date: string) => lead.nextFollowUpDate !== null && lead.nextFollowUpDate <= date;
const contactName = (app: ModuleProps, project: Project) => app.snapshot.clients.find(client => client.id === project.clientId)?.name || project.clientName || 'No linked client';

function ClientDetails({ app, client, open }: { app: ModuleProps; client: Client; open: OpenDialog }) {
  const projects = app.snapshot.projects.filter(project => project.clientId === client.id);
  return <div className="cp-details">
    <div className="cp-detail-heading"><Users size={24} /><div><h3>{client.name}</h3><span className="cp-badge">{client.archivedAt === null ? 'Active client' : 'Archived client'}</span></div></div>
    <dl className="cp-contact"><div><dt>Phone</dt><dd>{client.phone || 'Not provided'}</dd></div><div><dt>Email</dt><dd>{client.email || 'Not provided'}</dd></div></dl>
    {client.note && <p className="cp-note">{client.note}</p>}
    <div className="actions"><button className="secondary" data-navigate onClick={() => open({ kind: 'edit-client', id: client.id })}>Edit client</button><button className="secondary" data-navigate onClick={() => open({ kind: 'archive-client', id: client.id })}>{client.archivedAt === null ? 'Archive client' : 'Restore client'}</button></div>
    <div className="cp-section-heading"><h3>Projects</h3><button className="text-button" data-navigate onClick={() => open({ kind: 'new-project', clientId: client.id })}><Plus size={18} />Add project</button></div>
    {projects.length ? <ul className="cp-records">{projects.map(project => <li key={project.id}><button className="cp-record" onClick={() => { open(null); app.onOpenProject(project.id); }}><span><strong>{project.name}</strong><small>{project.status !== 'completed' ? 'Open project' : 'Completed project'}</small></span><ChevronRight size={20} /></button></li>)}</ul> : <p className="empty-state">No projects for this client yet.</p>}
    <FilesPanel app={app} parentType="client" parentId={client.id} />
  </div>;
}
function LeadDetails({ app, lead, open }: { app: ModuleProps; lead: Lead; open: OpenDialog }) {
  const linked = app.snapshot.clients.find(client => client.id === lead.convertedClientId);
  return <div className="cp-details"><h3>{lead.name}</h3><p className="cp-note">{lead.workDescription}</p>
    <dl className="cp-contact"><div><dt>Phone</dt><dd>{lead.phone || 'Not provided'}</dd></div><div><dt>Email</dt><dd>{lead.email || 'Not provided'}</dd></div><div><dt>Next follow-up</dt><dd>{lead.nextFollowUpDate ?? 'No reminder'}{due(lead, app.businessDate) && <span className="cp-badge cp-warning">Due</span>}</dd></div></dl>
    <div className="actions"><button className="primary" data-navigate onClick={() => open({ kind: 'follow-up', id: lead.id })}>Record follow-up</button><button className="secondary" data-navigate onClick={() => open({ kind: 'edit-lead', id: lead.id })}>Edit lead</button>
      {linked ? <button className="secondary" data-navigate onClick={() => open({ kind: 'client', id: linked.id })}>View client: {linked.name}</button> : <button className="secondary" data-navigate onClick={() => open({ kind: 'convert', id: lead.id })}>Convert to client</button>}
    </div><h3>Follow-up history</h3>
    {lead.followUps.length ? <ol className="cp-history">{[...lead.followUps].sort((a, b) => b.at - a.at).map(followUp => <li key={followUp.id}><time dateTime={new Date(followUp.at).toISOString()}>{new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }).format(followUp.at)}</time><p className="cp-note">{followUp.note}</p></li>)}</ol> : <p className="empty-state">No follow-ups recorded yet.</p>}
  </div>;
}
function FeatureDialog({ app, state, open }: { app: ModuleProps; state: DialogState; open: OpenDialog }) {
  const close = () => open(null), id = 'id' in state ? state.id : undefined;
  const client = app.snapshot.clients.find(c => c.id === id), lead = app.snapshot.leads.find(l => l.id === id), project = app.snapshot.projects.find(p => p.id === id);
  const titles: Record<DialogState['kind'], string> = { client: 'Client details', 'edit-client': 'Edit client', 'archive-client': client?.archivedAt === null ? 'Archive client' : 'Restore client', lead: 'Lead details', 'edit-lead': 'Edit lead', 'follow-up': 'Record follow-up', convert: 'Convert lead to client', 'edit-project': 'Edit project', 'project-status': project && project.status !== 'completed' ? 'Complete project' : 'Reopen project', 'new-client': 'Add client', 'new-lead': 'Add lead', 'new-project': 'Add project' };
  let content;
  switch (state.kind) {
    case 'new-client': content = <ClientForm app={app} done={close} />; break;
    case 'edit-client': content = client && <ClientForm app={app} client={client} done={close} />; break;
    case 'client': content = client && <ClientDetails app={app} client={client} open={open} />; break;
    case 'archive-client': content = client && <ArchiveForm app={app} client={client} done={close} />; break;
    case 'new-lead': content = <LeadForm app={app} done={close} />; break;
    case 'edit-lead': content = lead && <LeadForm app={app} lead={lead} done={close} />; break;
    case 'lead': content = lead && <LeadDetails app={app} lead={lead} open={open} />; break;
    case 'follow-up': content = lead && <FollowUpForm app={app} lead={lead} done={close} />; break;
    case 'convert': content = lead && <ConvertForm app={app} lead={lead} done={close} />; break;
    case 'new-project': content = <ProjectForm app={app} clientId={state.clientId} done={close} />; break;
    case 'edit-project': content = project && <ProjectForm app={app} project={project} done={close} />; break;
    case 'project-status': content = project && <ProjectStatusForm app={app} project={project} done={close} />; break;
  }
  return <RecordModal title={titles[state.kind]} onClose={close}><div className="cp-dialog" key={state.kind + (id ?? '')}>{content || <p>This record is no longer available. Close this dialog and refresh.</p>}</div></RecordModal>;
}

export function ClientsView(app: ModuleProps) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'clients' | 'leads'>(app.selection?.leadId ? 'leads' : 'clients');
  const [clientFilter, setClientFilter] = useState('active'), [leadFilter, setLeadFilter] = useState('all');
  const [dialog, open] = useState<DialogState | null>(() => app.selection?.clientId ? { kind: 'client', id: app.selection.clientId } : app.selection?.leadId ? { kind: 'lead', id: app.selection.leadId } : null);
  const search = query.trim().toLocaleLowerCase();
  const clients = app.snapshot.clients.filter(client => (clientFilter === 'all' || (clientFilter === 'archived') === (client.archivedAt !== null)) && [client.name, client.phone, client.email, client.note].some(value => value.toLocaleLowerCase().includes(search)));
  const leads = app.snapshot.leads.filter(lead => (leadFilter !== 'due' || due(lead, app.businessDate)) && [lead.name, lead.phone, lead.email, lead.workDescription].some(value => value.toLocaleLowerCase().includes(search))).sort((a, b) => Number(due(b, app.businessDate)) - Number(due(a, app.businessDate)) || (a.nextFollowUpDate ?? '9999').localeCompare(b.nextFollowUpDate ?? '9999'));
  const dueCount = app.snapshot.leads.filter(lead => due(lead, app.businessDate)).length;
  return <section className="cp-module" aria-label="Clients and leads">
    <header className="cp-header"><div><p className="cp-eyebrow">PEOPLE & WORK</p><h2>Clients & leads</h2><p className="muted">Contact details, upcoming conversations and their projects.</p></div><button className="primary" onClick={() => open({ kind: tab === 'clients' ? 'new-client' : 'new-lead' })}><Plus size={18} />Add {tab === 'clients' ? 'client' : 'lead'}</button></header>
    <div className="cp-tabs" role="group" aria-label="Record type"><button aria-pressed={tab === 'clients'} onClick={() => { setTab('clients'); setQuery(''); }}>Clients <span>{app.snapshot.clients.length}</span></button><button aria-pressed={tab === 'leads'} onClick={() => { setTab('leads'); setQuery(''); }}>Leads <span>{app.snapshot.leads.length}</span></button></div>
    <div className="cp-toolbar"><div className="field"><label htmlFor="cp-search"><Search size={16} />Search {tab}</label><input id="cp-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, phone or notes" /></div>
      <div className="field"><label htmlFor="cp-filter">Show</label>{tab === 'clients' ? <select id="cp-filter" value={clientFilter} onChange={event => setClientFilter(event.target.value)}><option value="active">Active clients</option><option value="archived">Archived clients</option><option value="all">All clients</option></select> : <select id="cp-filter" value={leadFilter} onChange={event => setLeadFilter(event.target.value)}><option value="all">All leads</option><option value="due">Follow-ups due ({dueCount})</option></select>}</div>
    </div>
    <div className="cp-surface">{tab === 'clients' ? clients.length ? <ul className="cp-records">{clients.map(client => <li key={client.id}><button className="cp-record" onClick={() => open({ kind: 'client', id: client.id })}><span className="cp-avatar" aria-hidden="true">{client.name.slice(0, 1).toLocaleUpperCase()}</span><span><strong>{client.name}</strong><small>{client.archivedAt !== null ? 'Archived · ' : ''}{app.snapshot.projects.filter(project => project.clientId === client.id).length} projects{client.phone ? ' · ' + client.phone : ''}</small></span><ChevronRight size={20} /></button></li>)}</ul> : <p className="empty-state">{search ? 'No clients match your search.' : 'No clients here yet. Add a client to keep their jobs together.'}</p> : leads.length ? <ul className="cp-records">{leads.map(lead => <li key={lead.id}><button className="cp-record" onClick={() => open({ kind: 'lead', id: lead.id })}><span><strong>{lead.name}</strong><small>{lead.workDescription}</small><small>{lead.nextFollowUpDate ? 'Follow up ' + lead.nextFollowUpDate : 'No follow-up reminder'}{lead.convertedClientId ? ' · Linked to client' : ''}</small></span>{due(lead, app.businessDate) && <span className="cp-badge cp-warning">Due</span>}<ChevronRight size={20} /></button></li>)}</ul> : <p className="empty-state">{leadFilter === 'due' ? 'No follow-ups due.' : search ? 'No leads match your search.' : 'Add a lead when someone asks about a job.'}</p>}</div>
    {dialog && <FeatureDialog app={app} state={dialog} open={open} />}
  </section>;
}

export function ProjectsView(app: ModuleProps) {
  const [filter, setFilter] = useState<'open' | 'completed'>('open'), [query, setQuery] = useState('');
  const [dialog, open] = useState<DialogState | null>(null);
  const projects = app.snapshot.projects.filter(project => (filter === 'completed' ? project.status === 'completed' : project.status !== 'completed') && [project.name, project.address, contactName(app, project)].some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  return <section className="cp-module cp-projects" aria-label="Projects"><header className="cp-header"><button className="secondary cp-project-add" onClick={() => open({ kind: 'new-project' })}><Plus size={16} aria-hidden="true" />Add project</button></header>
    <div className="cp-project-controls"><div className="cp-tabs" role="group" aria-label="Project status">{(['open', 'completed'] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === 'open' ? 'Open' : 'Completed'} <span>{app.snapshot.projects.filter(project => (status === 'completed' ? project.status === 'completed' : project.status !== 'completed')).length}</span></button>)}</div>
    </div>
    <div className="field cp-project-search"><label htmlFor="cp-project-search">Search projects</label><Search size={18} aria-hidden="true" /><input id="cp-project-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Project, client or address" /></div>
    <p className="cp-eyebrow cp-project-list-label">YOUR WORK, TOGETHER</p>
    <div className="cp-project-grid">{projects.map(project => {
      const completion = projectCompletion(project.id, app.snapshot.tasks);
      const tasks = app.snapshot.tasks.filter(task => task.projectId === project.id && !task.parentTaskId && !task.archivedAt);
      const remaining = tasks.filter(task => task.status !== 'done').length;
      return <article className="cp-project-card" key={project.id}>
        <h3 aria-label={project.name}><button className="cp-project-open" aria-label={'View project: ' + project.name} onClick={() => app.onOpenProject(project.id)}><span>{project.name}</span><ChevronRight size={18} aria-hidden="true" /></button></h3>
        <div className="cp-card-completion">{completion !== null ? <progress max={1} value={completion} aria-label={`${project.name} completion`} /> : <p className="muted">Start with a task. Build the plan as you go.</p>}<div><span>{completion === null ? 'Ready to plan' : completionPercent(completion) + '% complete'}</span><strong>{tasks.length ? remaining ? `${remaining} ${remaining === 1 ? 'task' : 'tasks'} active` : 'All tasks complete' : 'Add your first task'}</strong></div></div>
      </article>;
    })}</div>
    {!projects.length && <p className="empty-state">{query ? 'No projects match your search.' : filter === 'completed' ? 'No completed projects yet.' : 'Add a project to organize a new job.'}</p>}
    {dialog && <FeatureDialog app={app} state={dialog} open={open} />}
  </section>;
}

export function ProjectDetail(app: ModuleProps) {
  const [dialog, open] = useState<DialogState | null>(null);
  const [selectedSection, setSelectedSection] = useState('tasks');
  const sectionId = useId();
  const project = app.snapshot.projects.find(project => project.id === app.selection?.projectId);
  if (!project) return <section className="cp-module"><h1>Project unavailable</h1><p>Choose a saved project to see its details.</p><button className="secondary" onClick={app.onClose}>Back to projects</button></section>;
  const summary = projectSummary(app.snapshot, project.id), client = app.snapshot.clients.find(client => client.id === project.clientId);
  const completion = projectCompletion(project.id, app.snapshot.tasks), owner = can(app.snapshot.currentUser?.role, 'money.costs');
  const sections = [{ key: 'tasks', label: 'Tasks' }, { key: 'notes', label: 'Notes' }, { key: 'files', label: 'Files' }, { key: 'activity', label: 'Activity' }, ...(owner ? [{ key: 'purchases', label: 'Purchases' }] : [])];
  function jump(event: MouseEvent<HTMLAnchorElement>, key: string) {
    event.preventDefault();
    setSelectedSection(key);
    const section = document.getElementById(sectionId + '-' + key);
    section?.scrollIntoView({ block: 'start' });
    section?.focus({ preventScroll: true });
  }
  return <section className="cp-module cp-project-detail" aria-label="Project details"><div className="cp-project-back-row"><button className="text-button cp-back" onClick={app.onClose}><ArrowLeft size={16} aria-hidden="true" />Back to projects</button><span>Overview</span></div>
    <header className="cp-header"><div><span className="cp-badge">{project.status !== 'completed' ? 'Open project' : 'Completed project'}</span><h1>{project.name}</h1>{project.note && <p className="cp-note cp-project-intro">{project.note}</p>}</div></header>
    <nav className="cp-section-nav" aria-label="Project sections">{sections.map(({ key, label }) => <a key={key} aria-current={selectedSection === key ? 'location' : undefined} href={'#' + sectionId + '-' + key} onClick={event => jump(event, key)}>{label}</a>)}</nav>
    <div className="cp-project-context"><div className="cp-context-item"><div className="cp-context-label"><User size={16} aria-hidden="true" /><span>Client</span></div>{client ? <button className="cp-client-link" onClick={() => app.onOpenClient(client.id)}><span>{client.name}{client.archivedAt !== null ? ' (archived)' : ''}</span><ChevronRight size={16} aria-hidden="true" /></button> : <p>{project.clientName || 'No linked client'}</p>}</div>{project.address && <div className="cp-context-item"><div className="cp-context-label"><MapPin size={16} aria-hidden="true" /><span>Job address</span></div><p className="cp-note">{project.address}</p></div>}</div>
    <div className="cp-progress-card"><div className="cp-progress-heading"><h3>Project Progress</h3><strong>{completion === null ? 'Ready to plan' : completionPercent(completion) + '%'}</strong></div>{completion !== null && <progress max={1} value={completion} aria-label="Project completion" />}<dl className="cp-project-totals"><div><dt><Clock3 size={14} aria-hidden="true" />Logged time:</dt><dd>{formatDuration(summary.loggedMs)}</dd></div>{owner && <div><dt><DollarSign size={14} aria-hidden="true" />Spending:</dt><dd>{formatMoney(summary.spendingCents)}</dd></div>}</dl></div>
    <div className="cp-project-edit-row"><button className="text-button" onClick={() => open({ kind: 'edit-project', id: project.id })}><Pencil size={15} aria-hidden="true" />Edit project</button></div>
    {summary.hasRunningTimer && <p className="info-panel">Includes the running session as of the latest refresh. The timer continues until you pause it.</p>}
    <section className="cp-project-section" id={sectionId + '-tasks'} aria-label="Tasks section" tabIndex={-1}><TaskChecklist {...app} selection={{ projectId: project.id }} /></section>
    <section className="cp-project-section" id={sectionId + '-notes'} aria-label="Notes section" tabIndex={-1}><ProjectNotesPanel app={app} projectId={project.id} /></section>
    <section className="cp-project-section" id={sectionId + '-files'} aria-label="Files section" tabIndex={-1}><FilesPanel app={app} parentType="project" parentId={project.id} /></section>
    <section className="cp-project-section" id={sectionId + '-activity'} aria-label="Activity section" tabIndex={-1}><UpdatesPanel app={app} projectId={project.id} /></section>
    {owner && <section className="cp-project-section cp-surface" id={sectionId + '-purchases'} aria-label="Purchases section" tabIndex={-1}><div className="cp-section-heading"><h3>Purchases</h3><button className="text-button" onClick={() => app.onAddExpense(project.id)}><Plus size={18} />Add expense</button></div>{summary.expenses.length ? <ul className="cp-records">{[...summary.expenses].sort((a, b) => b.createdAt - a.createdAt).map(expense => <li key={expense.id}><button className="cp-record" onClick={() => app.onOpenExpense(expense.id)}><span><strong>{expense.description}</strong><small>{expense.purchaseDate}</small></span><strong>{formatMoney(expense.amountCents)}</strong></button></li>)}</ul> : <p className="empty-state">No purchases recorded for this project.</p>}</section>}
    <footer className="cp-project-footer"><p className="muted">{project.status !== 'completed' ? 'All set with this job?' : 'More work to do on this job?'}</p><button className="secondary" onClick={() => open({ kind: 'project-status', id: project.id })}><Check size={18} aria-hidden="true" />{project.status !== 'completed' ? 'Complete project' : 'Reopen project'}</button></footer>
    {dialog && <FeatureDialog app={app} state={dialog} open={open} />}
  </section>;
}

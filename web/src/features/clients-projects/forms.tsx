import { tx } from '../../i18n';
import type { Client, Lead, Project } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { RecordForm, type FormField } from './RecordForm';
import { projectSummary } from './projectSummary';
import { quantityLabel } from '@pirata/domain/domain/selectors';

const contactFields: FormField[] = [
  { name: 'name', label: tx('Name') }, { name: 'phone', label: tx('Phone (optional)'), type: 'tel' },
  { name: 'email', label: tx('Email (optional)'), type: 'email' },
];
type FormProps = { app: ModuleProps; done(): void };
export function ClientForm({ app, client, done }: FormProps & { client?: Client }) {
  return <RecordForm app={app} initial={{ name: client?.name ?? '', phone: client?.phone ?? '', email: client?.email ?? '', note: client?.note ?? '' }} fields={[...contactFields, { name: 'note', label: tx('Notes (optional)'), type: 'textarea' }]} command={v => ({ ...(client ? { type: 'client.update' as const, id: client.id } : { type: 'client.create' as const }), name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim(), note: v.note.trim() })} message={client ? 'Client updated.' : 'Client added.'} done={done} />;
}
export function LeadForm({ app, lead, done }: FormProps & { lead?: Lead }) {
  return <RecordForm app={app} initial={{ name: lead?.name ?? '', phone: lead?.phone ?? '', email: lead?.email ?? '', workDescription: lead?.workDescription ?? '', nextFollowUpDate: lead?.nextFollowUpDate ?? '' }} fields={[...contactFields, { name: 'workDescription', label: tx('Work description'), type: 'textarea' }, { name: 'nextFollowUpDate', label: tx('Next follow-up date (optional)'), type: 'date', hint: tx('Leave blank for no reminder.') }]} command={v => ({ ...(lead ? { type: 'lead.update' as const, id: lead.id } : { type: 'lead.create' as const }), name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim(), workDescription: v.workDescription.trim(), nextFollowUpDate: v.nextFollowUpDate || null })} message={lead ? 'Lead updated.' : 'Lead added.'} done={done} />;
}
export function ProjectForm({ app, project, clientId, done }: FormProps & { project?: Project; clientId?: string }) {
  return <RecordForm app={app} initial={{ name: project?.name ?? '', clientId: project?.clientId ?? clientId ?? '', address: project?.address ?? '', note: project?.note ?? '' }} fields={[
    { name: 'name', label: tx('Project name') },
    { name: 'clientId', label: tx('Client'), type: 'select', options: [{ value: '', label: tx('Choose a client') }, ...app.snapshot.clients.map(c => ({ value: c.id, label: c.name + (c.archivedAt !== null ? ' (archived)' : '') }))] },
    { name: 'address', label: tx('Job address (optional)'), type: 'textarea' }, { name: 'note', label: tx('Project notes (optional)'), type: 'textarea' },
  ]} command={v => ({ ...(project ? { type: 'project.update' as const, id: project.id } : { type: 'project.create' as const }), name: v.name.trim(), clientId: v.clientId || null, clientName: v.clientId ? app.snapshot.clients.find(c => c.id === v.clientId)?.name ?? '' : project?.clientId === null ? project.clientName : '', address: v.address.trim(), note: v.note.trim() })} message={project ? 'Project updated.' : 'Project added.'} done={done}>
    {project?.clientId === null && project.clientName && <p className="info-panel">Original client name: {project.clientName}. It stays with this project until you link a client.</p>}
  </RecordForm>;
}
export function FollowUpForm({ app, lead, done }: FormProps & { lead: Lead }) {
  return <RecordForm app={app} initial={{ note: '', nextFollowUpDate: '' }} fields={[{ name: 'note', label: tx('Follow-up note'), type: 'textarea' }, { name: 'nextFollowUpDate', label: tx('Next follow-up date (optional)'), type: 'date', hint: tx('Leave blank to clear the reminder.') }]} command={v => ({ type: 'lead.followUp', id: lead.id, note: v.note.trim(), nextFollowUpDate: v.nextFollowUpDate || null })} message={'Follow-up recorded for ' + lead.name + '.'} submitLabel={tx('Record follow-up')} done={done}><p className="dialog-intro">Record what happened with {lead.name}. This does not send a message or email.</p></RecordForm>;
}
export function ConvertForm({ app, lead, done }: FormProps & { lead: Lead }) {
  return <RecordForm app={app} initial={{ clientId: '' }} fields={[{ name: 'clientId', label: tx('Client to link'), type: 'select', options: [{ value: '', label: tx('Create a new client from this lead') }, ...app.snapshot.clients.map(c => ({ value: c.id, label: c.name + (c.archivedAt !== null ? ' (archived)' : '') }))] }]} command={v => ({ type: 'lead.convertToClient', id: lead.id, clientId: v.clientId || null })} message={'Client linked to ' + lead.name + '.'} submitLabel={tx('Convert lead')} done={done}><p className="dialog-intro">{lead.name}’s lead and follow-up history stay saved. Choosing an existing client leaves that client’s contact details unchanged.</p></RecordForm>;
}
export function ArchiveForm({ app, client, done }: FormProps & { client: Client }) {
  const archived = client.archivedAt === null;
  return <RecordForm app={app} initial={{}} fields={[]} command={() => ({ type: 'client.archive', id: client.id, archived })} message={archived ? 'Client archived. Project links preserved.' : 'Client restored.'} submitLabel={archived ? 'Archive client' : 'Restore client'} done={done}><p>{client.name}’s existing projects and contact history will remain available.</p></RecordForm>;
}
export function ProjectStatusForm({ app, project, done }: FormProps & { project: Project }) {
  const summary = projectSummary(app.snapshot, project.id), complete = project.status !== 'completed';
  return <RecordForm app={app} initial={{}} fields={[]} command={() => ({ type: 'project.setStatus', id: project.id, status: complete ? 'completed' : 'scheduled' })} message={complete ? 'Project completed.' : 'Project reopened.'} submitLabel={complete ? 'Complete project' : 'Reopen project'} done={done}>
    <p>{complete ? 'Complete' : 'Reopen'} {project.name}?</p>
    {complete && <div className="info-panel"><strong>{summary.outstanding.length} unfinished {summary.outstanding.length === 1 ? 'task' : 'tasks'}</strong><ul className="cp-simple-list">{summary.outstanding.map(task => <li key={task.id}>{task.title} · {task.status}</li>)}</ul>
      <p>{summary.reservations.length ? 'Reserved materials:' : 'No reserved materials.'}</p><ul className="cp-simple-list">{summary.reservations.map(r => { const m = app.snapshot.materials.find(m => m.id === r.materialId)!; return <li key={r.id}>{m.name}: {quantityLabel(r.reservedMinor, m.unit)}</li>; })}</ul>
      {summary.hasRunningTimer && <p><strong>{tx('A timer is running. Completing this project leaves it running.')}</strong></p>}
    </div>}
    <p className="dialog-intro">{tx('Tasks, time records, schedule, purchases and reservations remain unchanged.')}</p>
  </RecordForm>;
}

import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Check, Download, FileText, ImagePlus, RotateCcw, Search, Trash2, Upload, UploadCloud } from 'lucide-react';
import type { Attachment, BusinessSnapshot } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import './styles.css';
import { filesFor, type FileParent } from './hierarchy';

const url = (id: string) => '/api/v1/files/' + encodeURIComponent(id);
function parentLabel(snapshot: BusinessSnapshot, file: Attachment) { return file.parentType === 'task' ? snapshot.tasks.find(t => t.id === file.parentId)?.title ?? 'Task' : file.parentType === 'project' ? snapshot.projects.find(p => p.id === file.parentId)?.name ?? 'Project' : snapshot.clients.find(c => c.id === file.parentId)?.name ?? 'Client'; }
type Upload = { id: string; file: File; progress: number; state: 'queued' | 'uploading' | 'error' | 'done'; error?: string; outcomeUnknown?: boolean };
export function FilesView(app: ModuleProps) {
  const [context, setContext] = useState(''), [pending, setPending] = useState(false);
  const picker = useRef<HTMLSelectElement>(null), id = useId();
  const separator = context.indexOf(':');
  const parentType = context ? context.slice(0, separator) as FileParent['parentType'] : undefined;
  const parentId = context ? context.slice(separator + 1) : undefined;
  return <section className="co-module co-files-view" aria-label="File library">
    <div className="co-file-context" data-non-draft><label htmlFor={id}>View files / upload to</label><select ref={picker} id={id} aria-describedby={id + '-help'} disabled={pending} value={context} onChange={event => setContext(event.target.value)}><option value="">All shared files</option><optgroup label="Projects">{app.snapshot.projects.map(project => <option key={project.id} value={'project:' + project.id}>{project.name}</option>)}</optgroup><optgroup label="Tasks">{app.snapshot.tasks.filter(task => task.archivedAt == null).map(task => <option key={task.id} value={'task:' + task.id}>{task.title}{task.projectId ? ' · ' + (app.snapshot.projects.find(project => project.id === task.projectId)?.name ?? 'Project') : ' · Unfiled task'}</option>)}</optgroup><optgroup label="Clients">{app.snapshot.clients.filter(client => client.archivedAt == null).map(client => <option key={client.id} value={'client:' + client.id}>{client.name}</option>)}</optgroup></select><p id={id + '-help'}>{pending ? 'Finish or resolve current uploads before changing location.' : context ? 'Includes files from related tasks and projects. New uploads stay attached to the selected location.' : 'Browse every shared file, or choose a task, project, or client above.'}</p></div>
    <FilesPanel key={context || 'all'} app={app} parentType={parentType} parentId={parentId} library onChooseContext={() => picker.current?.focus()} onPendingChange={setPending} />
  </section>;
}

export function FilesPanel({ app, parentType, parentId, library = false, onChooseContext, onPendingChange }: { app: ModuleProps; parentType?: FileParent['parentType']; parentId?: string; library?: boolean; onChooseContext?: () => void; onPendingChange?: (pending: boolean) => void }) {
  const inputId = useId(), [jobs, setJobs] = useState<Upload[]>([]), [error, setError] = useState(''), [showRemoved, setShowRemoved] = useState(false), [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState(''), [kind, setKind] = useState<'all' | 'photos' | 'pdfs'>('all');
  const jobsRef = useRef(new Map<string, Upload>()), inProgress = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null), cameraInput = useRef<HTMLInputElement>(null);
  const allFiles = parentType && parentId ? filesFor(app.snapshot, { parentType, parentId }) : app.snapshot.attachments ?? [];
  const removedCount = allFiles.filter(f => f.removedAt !== null).length;
  const files = allFiles.filter(file => (showRemoved || file.removedAt === null) && (kind === 'all' || kind === 'photos' && file.mimeType.startsWith('image/') || kind === 'pdfs' && file.mimeType === 'application/pdf') && (!query.trim() || [file.name, parentLabel(app.snapshot, file)].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  const pending = Boolean(removing) || jobs.some(job => job.state === 'queued' || job.state === 'uploading');
  const failed = jobs.some(job => job.state === 'error');
  useEffect(() => { onPendingChange?.(pending || failed); }, [pending, failed, onPendingChange]);
  function update(id: string, patch: Partial<Upload>) { const job = jobsRef.current.get(id); if (job) Object.assign(job, patch); setJobs([...jobsRef.current.values()]); }
  async function send(job: Upload) {
    if (!parentType || !parentId) return;
    update(job.id, { state: 'uploading', progress: 0, error: undefined, outcomeUnknown: false });
    let outcomeUnknown = false;
    try {
      const session = await app.service.session();
      if (!session.authenticated) throw Error('Sign in again, then retry this same upload.');
      const query = new URLSearchParams({ parentType, parentId, name: job.file.name });
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest(); request.open('PUT', url(job.id) + '?' + query); request.withCredentials = true;
        request.setRequestHeader('Content-Type', 'application/octet-stream'); request.setRequestHeader('X-CSRF-Token', session.csrfToken); request.timeout = 150000;
        request.upload.onprogress = event => { if (event.lengthComputable) update(job.id, { progress: Math.min(99, Math.round(event.loaded / event.total * 100)) }); };
        request.onload = () => { if (request.status >= 200 && request.status < 300) resolve(); else { outcomeUnknown = request.status >= 500 || request.status === 408; let message = 'Upload failed. Retry this file.'; try { message = JSON.parse(request.responseText).error.message; } catch { /* retain readable fallback */ } reject(Error(message)); } };
        request.onerror = request.ontimeout = () => { outcomeUnknown = true; reject(Error('Connection interrupted. Retry this same upload; it will not create a duplicate.')); };
        request.send(job.file);
      });
      update(job.id, { state: 'done', progress: 100 });
      await app.refresh().catch(() => setError('File saved. Refresh the list to see it.'));
    } catch (cause) { update(job.id, { state: 'error', error: cause instanceof Error ? cause.message : 'Upload failed. Retry this file.', outcomeUnknown }); }
  }
  async function drain() { if (inProgress.current) return; inProgress.current = true; try { for (const job of jobsRef.current.values()) if (job.state === 'queued') await send(job); } finally { inProgress.current = false; } }
  function selected(list: FileList | null) { if (!list || !parentType || !parentId) return; for (const file of Array.from(list)) { const job: Upload = { id: crypto.randomUUID(), file, progress: 0, state: 'queued' }; jobsRef.current.set(job.id, job); } setJobs([...jobsRef.current.values()]); void drain(); }
  async function remove(file: Attachment) {
    if (removing) return; setRemoving(file.id); setError('');
    try { const session = await app.service.session(), restore = file.removedAt !== null; const response = await fetch(url(file.id) + (restore ? '/restore' : ''), { method: restore ? 'POST' : 'DELETE', credentials: 'same-origin', headers: { 'X-CSRF-Token': session.csrfToken } }); if (!response.ok) throw Error('Could not change this file. Retry.'); await app.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change this file. Retry.'); }
    finally { setRemoving(null); }
  }
  return <section className={'co-panel co-files-panel' + (library ? ' co-files-library' : '')} aria-label="Photos and PDFs" data-non-draft data-save-phase={pending ? 'saving' : failed ? 'uncertain' : undefined} data-save-notice={pending ? 'Your files are still being saved. Keep this dialog open until the upload or file change finishes.' : failed ? 'Resolve failed uploads with Retry upload or Dismiss upload before closing.' : undefined}>
    <header className="co-heading">
      {!library && <div className="co-section-title"><span className="co-section-icon"><ImagePlus size={20} aria-hidden="true" /></span><div><h3>Photos & PDFs</h3><p className="muted">Keep the job in view.</p></div></div>}
      <button className="co-quiet" type="button" aria-label={showRemoved ? 'Hide removed' : 'Recover removed'} aria-pressed={showRemoved} onClick={() => setShowRemoved(!showRemoved)}><RotateCcw size={15} aria-hidden="true" />{showRemoved ? 'Hide removed' : 'Recover removed'}{removedCount > 0 && <span className="co-count" aria-hidden="true">{removedCount}</span>}</button>
    </header>
    <div className="co-upload-zone"><UploadCloud size={24} aria-hidden="true" /><div className="co-upload">
      <input ref={fileInput} id={inputId} hidden aria-label="Choose photos or PDFs" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif" multiple onChange={event => { selected(event.target.files); event.target.value = ''; }} />
      <input ref={cameraInput} id={inputId + '-camera'} hidden aria-label="Take a photo" type="file" accept="image/*" capture="environment" onChange={event => { selected(event.target.files); event.target.value = ''; }} />
      <button className="primary" type="button" onClick={() => parentId ? fileInput.current?.click() : onChooseContext?.()}><Upload size={18} aria-hidden="true" />{parentId ? 'Upload files' : 'Choose upload location'}</button>
      <button type="button" disabled={!parentId} onClick={() => cameraInput.current?.click()}><Camera size={18} aria-hidden="true" />Camera</button>
    </div>
    <p className="co-file-help">Photos · 20 MiB each &nbsp; / &nbsp; PDFs · 25 MiB each<br />iPhone HEIC photos are converted automatically.</p>
    </div>
    {showRemoved && <p className="co-inline-notice"><RotateCcw size={16} aria-hidden="true" />Removed files stay recoverable. Select Restore file to bring one back.</p>}
    {jobs.length > 0 && <ul className="co-list co-upload-jobs" aria-live="polite">{jobs.map(job => <li key={job.id}><div className="co-heading"><strong>{job.file.name}</strong>{job.state === 'done' && <Check size={18} aria-label="Uploaded" />}</div><p>{job.state === 'done' ? 'Uploaded' : job.state === 'uploading' ? job.progress >= 99 ? 'Processing photo or PDF…' : `Uploading ${job.progress}%` : job.state === 'queued' ? 'Waiting to upload' : job.error}</p>{job.state === 'uploading' && <progress max={100} value={job.progress} aria-label={'Uploading ' + job.file.name} />}{job.state === 'error' && <>{job.outcomeUnknown && <small>The upload result is unconfirmed. Retry uses the same file ID. Dismissing this message does not remove a file that may already be saved.</small>}<div className="co-actions"><button type="button" onClick={() => { update(job.id, { state: 'queued' }); void drain(); }}><RotateCcw size={16} aria-hidden="true" />Retry upload</button><button type="button" className="co-quiet" onClick={() => { jobsRef.current.delete(job.id); setJobs([...jobsRef.current.values()]); void app.refresh().catch(() => setError('Refresh the list when your connection returns.')); }}>Dismiss upload</button></div></>}</li>)}</ul>}
    {error && <div role="alert" className="co-error"><p>{error}</p><button type="button" onClick={() => void app.refresh().then(() => setError(''))}>Refresh files</button></div>}
    {library && <div className="co-file-toolbar"><label className="co-file-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search files" placeholder="Search files or locations" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="co-feed-filters" aria-label="File type">{([['all', 'All files'], ['photos', 'Photos'], ['pdfs', 'PDFs']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div></div>}
    <p className="co-file-list-title">Uploaded items ({files.length})</p>
    <ul className="co-files">{files.map(file => <li key={file.id} className={file.removedAt !== null ? 'co-file-removed' : undefined}>
      {file.removedAt === null && file.mimeType.startsWith('image/') ? <a className="co-file-preview" href={url(file.id) + '/content?preview=1'} target="_blank" rel="noreferrer"><img src={url(file.id) + '/content?preview=1'} alt={file.name} loading="lazy" /></a> : <div className="co-file-placeholder" aria-hidden="true">{file.removedAt !== null ? <RotateCcw size={26} /> : <FileText size={30} />}<span>{file.removedAt !== null ? 'Recoverable file' : 'PDF document'}</span></div>}
      <div className="co-file-copy"><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MiB · {app.snapshot.team?.find(member => member.id === file.uploadedBy)?.name ?? 'Team member'} · {new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(file.createdAt)}{file.removedAt !== null && ' · Removed'}</small><small>{parentLabel(app.snapshot, file)}</small></div>
      <div className="co-actions">{file.removedAt === null && <a href={url(file.id) + '/content'} download><Download size={15} aria-hidden="true" />Download {file.mimeType === 'application/pdf' ? 'PDF' : 'photo'}</a>}{file.removedAt === null && file.mimeType === 'application/pdf' && <a href={url(file.id) + '/content?preview=1'} target="_blank" rel="noreferrer">Open PDF</a>}<button className="co-quiet" type="button" disabled={removing === file.id} onClick={() => void remove(file)}>{file.removedAt === null ? <Trash2 size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}{file.removedAt === null ? 'Remove' : 'Restore file'}</button></div>
    </li>)}</ul>{!files.length && <div className="co-empty"><ImagePlus size={24} aria-hidden="true" /><p>{query.trim() || kind !== 'all' ? 'No matching files.' : showRemoved ? 'No files to recover here.' : 'A photo says a lot.'}<small>{query.trim() || kind !== 'all' ? 'Try another search or choose All files.' : showRemoved ? 'Removed files will appear here when you have them.' : 'Add a before photo, a label, or the plans for this job.'}</small></p></div>}
  </section>;
}

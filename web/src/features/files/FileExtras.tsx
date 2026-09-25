import { useState } from 'react';
import { Tag, X } from 'lucide-react';
import type { Attachment } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { runCommand } from '../work/commands';
import '../facts/styles.css';
export const TAG_SUGGESTIONS = ['before', 'after', 'reference', 'damage', 'receipt', 'label'];
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Tags and comments on one file (R-SALES-7). Rendered under each row of the files list. */
export function FileExtras({ app, file }: { app: ModuleProps; file: Attachment }) {
  const t = useT(), [tag, setTag] = useState(''), [comment, setComment] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const tags = (app.snapshot.attachmentTags ?? []).filter(row => row.attachmentId === file.id), comments = (app.snapshot.attachmentComments ?? []).filter(row => row.attachmentId === file.id).sort((a, b) => a.createdAt - b.createdAt);
  const name = (id: string) => app.snapshot.team?.find(member => member.id === id)?.name ?? '—';
  const run = async (command: Parameters<typeof runCommand>[1]) => { setBusy(true); const message = await runCommand(app, command); setBusy(false); setError(message ?? ''); return !message; };
  if (file.removedAt !== null) return null;
  return <div className="file-extras">
    <div className="file-tags"><Tag size={14} aria-hidden="true" />{tags.map(row => <span key={row.id} className="file-tag">{t('files.tag.' + row.tag) === 'files.tag.' + row.tag ? row.tag : t('files.tag.' + row.tag)}<button type="button" aria-label={t('files.removeTag', { tag: row.tag })} disabled={busy} onClick={() => void run({ type: 'attachment.tag', attachmentId: file.id, tag: row.tag, add: false })}><X size={12} aria-hidden="true" /></button></span>)}
      <input list={'file-tags-' + file.id} placeholder={t('files.addTag')} value={tag} maxLength={40} onChange={e => setTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && tag.trim()) { e.preventDefault(); void run({ type: 'attachment.tag', attachmentId: file.id, tag: tag.trim(), add: true }).then(ok => { if (ok) setTag(''); }); } }} /><datalist id={'file-tags-' + file.id}>{TAG_SUGGESTIONS.map(suggestion => <option key={suggestion} value={suggestion}>{t('files.tag.' + suggestion)}</option>)}</datalist>
      {tag.trim() && <button type="button" disabled={busy} onClick={() => void run({ type: 'attachment.tag', attachmentId: file.id, tag: tag.trim(), add: true }).then(ok => { if (ok) setTag(''); })}>{t('files.tagButton')}</button>}</div>
    {comments.length > 0 && <ul className="file-comments">{comments.map(row => <li key={row.id}><strong>{name(row.userId)}</strong><small>{timeFormat.format(row.createdAt)}</small><br />{row.body}</li>)}</ul>}
    <div className="file-comment-add"><input placeholder={t('files.addComment')} value={comment} maxLength={2000} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && comment.trim()) { e.preventDefault(); void run({ type: 'attachment.comment', attachmentId: file.id, body: comment.trim() }).then(ok => { if (ok) setComment(''); }); } }} />{comment.trim() && <button type="button" disabled={busy} onClick={() => void run({ type: 'attachment.comment', attachmentId: file.id, body: comment.trim() }).then(ok => { if (ok) setComment(''); })}>{t('files.commentButton')}</button>}</div>
    {error && <p role="alert" className="work-error">{error}</p>}
  </div>;
}

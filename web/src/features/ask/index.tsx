import { tx } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Undo2 } from 'lucide-react';
import type { BusinessCommand, MutationRequest } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { teamRequest } from '../../services/teamApi';
import { createMutation } from '../../services/api';
import './styles.css';

interface Answer {
  message: string;
  error?: boolean;
  proposal?: BusinessCommand;
  reviewId?: string;
  undo?: BusinessCommand;
  records?: Record<string, { id: string; title?: string; name?: string; body?: string; note?: string }[]>;
}

export function AskView(app: ModuleProps) {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<{ enabled: boolean; reason: string } | null>(null);
  const [result, setResult] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [answeredPrompt, setAnsweredPrompt] = useState('');
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const intent = useRef<{ requestId: string; prompt: string } | null>(null);
  const undo = useRef<MutationRequest | null>(null);

  useEffect(() => {
    let active = true;
    void teamRequest({ service: app.service }, 'ask/status').then(value => { if (active) setStatus(value); }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [app.service]);

  async function ask() {
    if (busy || !status?.enabled || !prompt.trim()) return;
    setBusy(true); setError('');
    if (!intent.current || intent.current.prompt !== prompt) intent.current = { requestId: crypto.randomUUID(), prompt };
    try {
      const value = await teamRequest(app, 'ask', intent.current);
      setResult(value); setAnsweredPrompt(prompt); intent.current = null; undo.current = null;
      await app.refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (busy) return;
    setBusy(true); setError('');
    try { setResult(await teamRequest(app, 'ask/confirm', { reviewId: result?.reviewId })); await app.refresh(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function undoChange() {
    if (!result?.undo || busy) return;
    setBusy(true); setError('');
    try {
      undo.current ??= createMutation(result.undo, app.snapshot.revision);
      await app.service.execute(undo.current); await app.refresh();
      setResult({ message: tx('Task removed from active work. Its record remains recoverable.') });
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="ask-view ask-figma" aria-label={tx('Ask Morgan')}>
    <div className="ask-suggestions" aria-label={tx('Ideas to ask Morgan')}>
      {[
        { label: tx('Capture a task'), text: 'Add a task to ' },
        { label: tx('Find a detail'), text: 'Find notes about ' },
        { label: tx('Plan the next step'), text: 'Find open tasks for ' },
      ].map(({ label, text }) => <button key={label} type="button" disabled={busy} onClick={() => { setPrompt(text); promptInput.current?.focus(); }}>{label}</button>)}
    </div>
    {result ? <div className="ask-conversation" aria-label={tx('Latest conversation')}>
      <p className="ask-question">{answeredPrompt}</p>
      <div className="ask-result" role="status">
        <div className="ask-answer-label">{tx('Morgan AI Assistant')}</div>
        <p>{result.message}</p>
        {result.proposal && <>
          <div className="ask-proposal"><strong>{result.proposal.type.replaceAll('.', ' ')}</strong>
            {Object.entries(result.proposal).filter(([key, value]) => !['type', 'id', 'parentTaskId', 'archivedAt', 'estimatedMinutes', 'assignmentExplicit'].includes(key) && value !== null && value !== '').map(([key, value]) => <p key={key}>{key === 'projectId' ? 'Project' : key === 'clientId' ? 'Client' : key.replace(/([A-Z])/g, ' $1')}: {key === 'projectId' ? app.snapshot.projects.find(p => p.id === value)?.name ?? 'Unfiled' : key === 'clientId' ? app.snapshot.clients.find(p => p.id === value)?.name ?? 'Unfiled' : String(value)}</p>)}
          </div>
          <div className="ask-result-actions"><button className="primary" disabled={busy} onClick={() => void confirm()}>{tx('Confirm this change')}</button><button disabled={busy} onClick={() => setResult(null)}>{tx('Cancel')}</button></div>
        </>}
        {result.undo && <button disabled={busy} onClick={() => void undoChange()}><Undo2 size={16} aria-hidden="true" />{tx('Undo task creation')}</button>}
        {result.records && Object.entries(result.records).map(([kind, records]) => <div className="ask-records" key={kind}><h3>{kind.replaceAll('_', ' ')}</h3>{records.length ? records.map(record => <article key={record.id}><strong>{record.title ?? record.name}</strong>{(record.body || record.note) && <p>{record.body ?? record.note}</p>}</article>) : <p>{tx('No matching records.')}</p>}</div>)}
      </div>
    </div> : <div className="ask-welcome"><MessageCircle size={24} aria-hidden="true" /><h3>{tx('What can we take off your mind?')}</h3><p>{tx('Add a task, find a project detail, or ask what needs doing next.')}</p></div>}
    {status && !status.enabled && <aside className="ask-configuration"><strong>{tx('System configuration')}</strong><p>{status.reason} The rest of the app is ready to use.</p></aside>}
    <form className="ask-composer" data-save-phase={busy ? 'saving' : 'editing'} data-form-dirty={prompt.trim().length > 0 && prompt !== answeredPrompt} onSubmit={event => { event.preventDefault(); void ask(); }}>
      <label htmlFor="ask-prompt">{tx('Ask Morgan')}</label>
      <div className="ask-input-row"><textarea ref={promptInput} id="ask-prompt" rows={2} maxLength={2000} required disabled={busy} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={tx('Ask Morgan…')} /><button className="primary ask-send" aria-label={busy ? 'Working…' : 'Ask'} title={tx('Send to Morgan')} disabled={busy || !status?.enabled || !prompt.trim()}><Send size={18} aria-hidden="true" /></button></div>
      {busy && <p className="ask-busy" role="status">{tx('Morgan is working on it…')}</p>}
    </form>
    {error && <p className="ask-error" role="alert">{error}</p>}
    <p className="ask-privacy">Only approved business actions are available. Photos and PDFs are not automatically sent. Review important details.</p>
  </section>;
}

import { useId, useRef, useState, type ReactNode } from 'react';
import { commandSchema, type BusinessCommand } from '@pirata/contracts/index';
import { createMutation, createSubmission, ServiceError } from '../../services/api';
import type { ModuleProps } from '../../services/moduleProps';
export type Values = Record<string, string>;
export interface Draft {
  values: Values;
  set(name: string, value: string): void;
  replace(values: Values): void;
  field(name: string, label: string, options?: { type?: string; options?: { value: string; label: string }[]; hint?: string; change?(value: string, previous: Values): Values }): ReactNode;
}
export function WorkForm({ app, initial, command, message, done, children, submitLabel = 'Save', validate, includeCancel = true }: {
  app: ModuleProps; initial: Values; command(values: Values): BusinessCommand; message: string; done(): void;
  children(draft: Draft): ReactNode; submitLabel?: string; validate?(values: Values): Values; includeCancel?: boolean;
}) {
  const [values, setValues] = useState(initial), [errors, setErrors] = useState<Values>({}), [error, setError] = useState('');
  const [phase, setPhase] = useState<'editing' | 'saving' | 'uncertain' | 'conflict' | 'saved'>('editing');
  const form = useRef<HTMLFormElement>(null), busy = useRef(false), submission = useRef<ReturnType<typeof createSubmission> | null>(null);
  const [original] = useState(()=>JSON.stringify(initial));
  const acknowledged = useRef(false), refreshSession = useRef(false), baseRevision = useRef(app.snapshot.revision), id = useId();
  function showErrors(next: Values) {
    setErrors(next);
    requestAnimationFrame(() => {
      const element = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]'); element?.focus();
    });
  }
  async function review() {
    if (busy.current) return;
    busy.current = true;
    try { const reviewed = await app.service.snapshot(); await app.refresh(); baseRevision.current = reviewed.revision; submission.current = null; setPhase('editing'); setError('Latest records loaded. Your draft is retained. Review it before saving again.'); }
    catch { setError('Could not refresh. Keep your draft and try again.'); }
    finally { busy.current = false; }
  }
  async function submit() {
    if (busy.current || phase === 'conflict') return;
    if (!submission.current) {
      const custom = validate?.(values) ?? {};
      const parsed = commandSchema.safeParse(command(values));
      if (!parsed.success) for (const issue of parsed.error.issues) { const path = issue.path.join('.'); const key = path in values ? path : path.replace(/^correction\./, ''); custom[key] ??= issue.message; }
      if (Object.keys(custom).length || !parsed.success) { showErrors(custom); setError('Check the highlighted fields.'); return; }
      showErrors({}); submission.current = createSubmission(app.service, createMutation(parsed.data, baseRevision.current));
    }
    busy.current = true; setPhase('saving'); setError('');
    try {
      if (refreshSession.current) {
        const session = await app.service.session();
        if (!session.authenticated) { setPhase('uncertain'); setError('Sign in in another tab, then retry this same save. Your draft and original request are retained.'); return; }
        refreshSession.current = false;
      }
      if (!acknowledged.current) { await submission.current.submit(); acknowledged.current = true; }
      await app.refresh(); app.onSaved(message); done();
    } catch (cause) {
      if (acknowledged.current) { setPhase('saved'); setError('Saved on the server, but refresh failed. Reload the saved record without submitting another mutation.'); }
      else if (cause instanceof ServiceError && cause.code === 'REVISION_CONFLICT') { setPhase('conflict'); setError('Records changed on another device. Refresh and review your draft before saving.'); }
      else if (cause instanceof ServiceError && (cause.status === 401 || cause.status === 403)) { refreshSession.current = true; setPhase('uncertain'); setError('Your sign-in needs refreshing. Retry this same save; if signed out, sign in in another tab first.'); }
      else if (cause instanceof ServiceError && [400, 404, 409, 422].includes(cause.status)) {
        submission.current = null; setPhase('editing'); setError(cause.message);
        showErrors(Object.fromEntries(Object.entries(cause.fields ?? {}).map(([k, v]) => [k.replace(/^command\./, ''), v])));
      } else { setPhase('uncertain'); setError('The save response could not be confirmed. Your draft is retained. Retry this same save to avoid duplicates.'); }
    } finally { busy.current = false; }
  }
  const draft: Draft = {
    values, set: (name, value) => setValues(v => ({ ...v, [name]: value })), replace: setValues,
    field: (name, label, options = {}) => {
      const fieldId = id + '-' + name, problem = errors[name];
      const shared = { id: fieldId, name, value: values[name] ?? '', 'aria-invalid': Boolean(problem), 'aria-describedby': problem ? fieldId + '-error' : options.hint ? fieldId + '-hint' : undefined, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { const value = e.target.value; setValues(v => options.change ? options.change(value, v) : { ...v, [name]: value }); } };
      return <div className="work-field" key={name}><label htmlFor={fieldId}>{label}</label>
        {options.options ? <select {...shared}>{options.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : options.type === 'textarea' ? <textarea {...shared} rows={3} /> : <input {...shared} type={options.type ?? 'text'} />}
        {options.hint && <small id={fieldId + '-hint'}>{options.hint}</small>}{problem && <p className="work-error" id={fieldId + '-error'}>{problem}</p>}
      </div>;
    },
  };
  return <form ref={form} data-save-phase={phase} data-form-dirty={JSON.stringify(values)!==original} noValidate onSubmit={e => { e.preventDefault(); void submit(); }}>
    <fieldset disabled={phase !== 'editing'}>{children(draft)}</fieldset>
    {error && <p role="alert" className="work-error">{error}</p>}
    {phase === 'conflict' && <button type="button" onClick={() => void review()}>Load latest records</button>}
    <footer className="work-actions">{includeCancel && <button type="button" data-cancel disabled={['saving', 'uncertain', 'saved'].includes(phase)}>Cancel</button>}<button type="submit" disabled={phase === 'saving' || phase === 'conflict'}>{phase === 'saving' ? 'Saving…' : phase === 'uncertain' ? 'Retry same save' : phase === 'saved' ? 'Reload saved record' : submitLabel}</button></footer>
  </form>;
}

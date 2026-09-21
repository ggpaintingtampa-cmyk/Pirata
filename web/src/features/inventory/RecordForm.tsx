import { useId, useRef, useState, type ReactNode } from 'react';
import { commandSchema, type BusinessCommand } from '@pirata/contracts/index';
import { createMutation, createSubmission, ServiceError } from '../../services/api';
import type { ModuleProps } from '../../services/moduleProps';

export interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'date' | 'textarea' | 'select';
  options?: { value: string; label: string }[];
  hint?: string;
}
interface Props {
  app: ModuleProps;
  initial: Record<string, string>;
  fields: FormField[];
  command(values: Record<string, string>): BusinessCommand;
  validate?(values: Record<string, string>): Record<string, string>;
  message: string;
  submitLabel?: string;
  done(): void;
  children?: ReactNode;
}

/** A draft and one request envelope per intent. Unknown outcomes retry unchanged. */
export function RecordForm({ app, initial, fields, command, validate, message, submitLabel = 'Save', done, children }: Props) {
  const formId = useId();
  const baseRevision = useRef(app.snapshot.revision);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'editing' | 'saving' | 'uncertain' | 'conflict' | 'saved'>('editing');
  const form = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const submission = useRef<ReturnType<typeof createSubmission> | null>(null);
  const acknowledged = useRef(false);
  const refreshSession = useRef(false);
  const locked = phase !== 'editing';

  function showErrors(next: Record<string, string>) {
    setErrors(next);
    requestAnimationFrame(() => {
      const first = fields.find(field => next[field.name]);
      if (first) (form.current?.elements.namedItem(first.name) as HTMLElement | null)?.focus();
    });
  }
  async function reviewLatest() {
    if (busy.current) return;
    busy.current = true;
    try {
      const latest = await app.service.snapshot();
      await app.refresh();
      submission.current = null;
      baseRevision.current = latest.revision;
      setPhase('editing');
      setError('Latest records loaded. Your draft is still here; review it before saving again.');
    } catch { setError('Could not load the latest records. Your draft is retained. Try again.'); }
    finally { busy.current = false; }
  }
  async function submit() {
    if (busy.current || phase === 'conflict') return;
    if (!submission.current) {
      const customErrors = validate?.(values) ?? {};
      const parsed = commandSchema.safeParse(command(values));
      if (!parsed.success || Object.keys(customErrors).length) {
        const next: Record<string, string> = { ...customErrors };
        for (const issue of parsed.success ? [] : parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
        showErrors(next); return;
      }
      showErrors({});
      submission.current = createSubmission(app.service, createMutation(parsed.data, baseRevision.current));
    }
    busy.current = true; setPhase('saving'); setError('');
    try {
      if (refreshSession.current) {
        const session = await app.service.session();
        if (!session.authenticated) {
          setPhase('uncertain'); setError('Sign in in another tab, then retry this same save here. Your original request and draft are retained.');
          return;
        }
        refreshSession.current = false;
      }
      if (!acknowledged.current) { await submission.current.submit(); acknowledged.current = true; }
      await app.refresh();
      app.onSaved(message); done();
    } catch (cause) {
      if (acknowledged.current) {
        setPhase('saved'); setError('Saved on the server, but the updated list could not load. Reload the saved record below; do not submit a new copy.');
      } else if (cause instanceof ServiceError && cause.code === 'REVISION_CONFLICT') {
        setPhase('conflict'); setError('Records changed while this form was open. Load the latest records and review your draft before saving.');
      } else if (cause instanceof ServiceError && (cause.status === 401 || cause.status === 403)) {
        refreshSession.current = true;
        setPhase('uncertain'); setError('Your sign-in needs to be refreshed. Retry this same save; if signed out, sign in in another tab first. The original request is retained to avoid duplicates.');
      } else if (cause instanceof ServiceError && [400, 404, 409, 422].includes(cause.status)) {
        submission.current = null; setPhase('editing'); setError(cause.message);
        showErrors(Object.fromEntries(Object.entries(cause.fields ?? {}).map(([key, value]) => [key.replace(/^command\./, ''), value])));
      } else {
        setPhase('uncertain'); setError('The save response could not be confirmed. Your draft is retained. Retry this same save to avoid a duplicate.');
      }
    } finally { busy.current = false; }
  }
  return <form ref={form} className="iv-form" data-save-phase={phase} noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
    {children}
    <fieldset disabled={locked}>
      {fields.map((field, index) => {
        const id = formId + '-' + field.name;
        const shared = { id, name: field.name, value: values[field.name] ?? '', 'aria-invalid': Boolean(errors[field.name]), 'aria-describedby': (errors[field.name] ? id + '-error ' : '') + (field.hint ? id + '-hint' : '') || undefined, 'data-autofocus': index === 0 ? true : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues(current => ({ ...current, [field.name]: event.target.value })) };
        return <div className="field" key={field.name}><label htmlFor={id}>{field.label}</label>
          {field.type === 'textarea' ? <textarea {...shared} rows={3} /> : field.type === 'select' ? <select {...shared}>{field.options?.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> : <input {...shared} type={field.type ?? 'text'} />}
          {field.hint && <small id={id + '-hint'}>{field.hint}</small>}
          {errors[field.name] && <p className="field-error" id={id + '-error'}>{errors[field.name]}</p>}
        </div>;
      })}
    </fieldset>
    {error && <p className="save-error" role="alert">{error}</p>}
    {phase === 'conflict' && <button type="button" className="secondary" onClick={() => void reviewLatest()}>Load latest records</button>}
    <div className="form-footer"><button type="button" className="secondary" data-cancel disabled={phase === 'saving' || phase === 'uncertain' || phase === 'saved'}>Cancel</button><button type="submit" className="primary" disabled={phase === 'saving' || phase === 'conflict'}>{phase === 'saving' ? 'Saving…' : phase === 'saved' ? 'Reload saved record' : phase === 'uncertain' ? 'Retry same save' : submitLabel}</button></div>
  </form>;
}

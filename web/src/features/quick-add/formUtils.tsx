import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ZodType } from 'zod';
import type { SaveResult } from '../../state/createAppStore';
export type Errors = Record<string, string>;
// eslint-disable-next-line react-refresh/only-export-components
export function useForm(initial: Record<string, string>) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState('');
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const set = (name: string, value: string) => setValues(previous => ({ ...previous, [name]: value }));
  const check = (name: string, value: unknown, schema: ZodType, result: Errors) => {
    const parsed = schema.safeParse(value); if (!parsed.success) result[name] = parsed.error.issues[0]?.message ?? 'Check this field.';
  };
  function submit(event: FormEvent<HTMLFormElement>, result: Errors, action: () => SaveResult) {
    event.preventDefault();
    if (busy.current) return;
    setErrors(result);
    if (Object.keys(result).length) {
      const name = Object.keys(result)[0];
      const target = event.currentTarget.elements.namedItem(name);
      if (target instanceof HTMLElement) target.focus();
      return;
    }
    busy.current = true; setSaving(true); setSaveError('');
    try {
      const saved = action();
      if (!saved.ok) { setSaveError(saved.error); busy.current = false; setSaving(false); }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save.'); busy.current = false; setSaving(false);
    }
  }
  return { values, set, errors, check, submit, saving, saveError };
}
export function Field({ name, label, error, children, hint }: { name: string; label: string; error?: string; children: ReactNode; hint?: string }) {
  return <div className="field"><label htmlFor={name}>{label}</label>{children}{hint && <small id={name + '-hint'}>{hint}</small>}{error && <p className="field-error" id={name + '-error'}>{error}</p>}</div>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function fieldProps(name: string, form: ReturnType<typeof useForm>) {
  return { id: name, name, value: form.values[name] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => form.set(name, e.target.value), 'aria-invalid': !!form.errors[name], 'aria-describedby': form.errors[name] ? name + '-error' : undefined };
}
export function FormFooter({ form, label = 'Save' }: { form: Pick<ReturnType<typeof useForm>, 'saving' | 'saveError'>; label?: string }) {
  return <>{form.saveError && <p role="alert" className="field-error save-error">{form.saveError}</p>}<div className="form-footer"><button type="button" className="secondary" data-cancel>Cancel</button><button className="primary" type="submit" disabled={form.saving}>{form.saving ? 'Saving…' : label}</button></div></>;
}

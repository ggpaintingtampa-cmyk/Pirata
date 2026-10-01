// P13: owner settings for content translation plus the owner/manager trade glossary.
import { useEffect, useState } from 'react';
import { KeyRound, Languages, Plus } from 'lucide-react';
import type { GlossaryTerm, TranslationSettings } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, useLocale, LOCALE_NAMES } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { formatDateTime } from '../../i18n/locale';
import { useCan } from '../../state/permissions';
import { useServer } from '../../state/serverContext';
import { runCommand } from '../work/commands';
import { useConfirm } from '../../components/ConfirmDialog';
interface Admin { settings: TranslationSettings; keyConfigured: boolean; usage: Record<string, unknown>[]; cached: number; backfillCursor: string | null; cacheEpoch: number; glossaryVersion: number }
interface BackfillResult { processedRecords: number; totalRecords: number; translated: number; unavailable: number; done: boolean }
export function TranslationSettingsView(app: ModuleProps) {
  const t = useT(), locale = useLocale(), owner = useCan('ask.admin'), { store } = useServer();
  const [admin, setAdmin] = useState<Admin | null>(null), [value, setValue] = useState<TranslationSettings | null>(null), [original, setOriginal] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [backfill, setBackfill] = useState<BackfillResult | null>(null);
  const load = async () => { try { const data = await store.service.call<Admin>('admin/translation'); setAdmin(data); setValue(data.settings); setOriginal(JSON.stringify(data.settings)); } catch (cause) { setError(errorMessage(locale, cause)); } };
  useEffect(() => { if (owner) void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, store]);
  const save = async () => {
    if (!value) return; setBusy(true); setError('');
    try { await store.service.call('admin/translation', value); setOriginal(JSON.stringify(value)); app.onSaved(t('translation.saved')); await load(); }
    catch (cause) { setError(errorMessage(locale, cause)); } finally { setBusy(false); }
  };
  const runBackfill = async (target: 'en' | 'es') => {
    setBusy(true); setError('');
    try { setBackfill(await store.service.call<BackfillResult>('admin/translation/backfill', { target, limit: 100 })); await load(); }
    catch (cause) { setError(errorMessage(locale, cause)); } finally { setBusy(false); }
  };
  return <>
    {owner && <section className="card team-settings team-figma" data-save-phase={busy ? 'saving' : 'editing'}>
      <header className="team-section-heading"><div><p className="team-eyebrow">{t('translation.eyebrow')}</p><h2>{t('translation.title')}</h2></div>{value && <span className="team-counter">{value.enabled && admin?.keyConfigured && value.provider !== 'none' ? t('translation.enabled') : t('translation.paused')}</span>}</header>
      {admin ? <div className="team-key-status"><KeyRound size={20} aria-hidden="true" /><div><strong>{admin.keyConfigured ? t('translation.keyConfigured') : t('translation.keyMissing')}</strong><p>{t('translation.keyHint')}</p></div></div> : !error && <p role="status">{t('translation.loading')}</p>}
      {value && <form data-form-dirty={JSON.stringify(value) !== original} onSubmit={event => { event.preventDefault(); void save(); }}>
        <label>{t('translation.provider')}<select disabled={busy} value={value.provider} onChange={event => setValue({ ...value, provider: event.target.value as TranslationSettings['provider'] })}><option value="openai">{t('translation.provider.openai')}</option><option value="none">{t('translation.provider.none')}</option></select></label>
        <label>{t('translation.model')}<input disabled={busy} value={value.model} onChange={event => setValue({ ...value, model: event.target.value })} placeholder="gpt-4o-mini" /></label>
        <div className="team-form-grid">{([['dailyRequests', t('translation.dailyRequests')], ['monthlyBudgetCents', t('translation.monthlyBudget')]] as const).map(([key, label]) => <label key={key}>{label}<input disabled={busy} type="number" min={0} required value={value[key]} onChange={event => setValue({ ...value, [key]: Number(event.target.value) })} /></label>)}</div>
        <details className="team-advanced"><summary>{t('translation.pricing')}</summary><p>{t('translation.pricingHint')}</p>{([['inputCentsPerMillion', t('translation.inputRate')], ['outputCentsPerMillion', t('translation.outputRate')]] as const).map(([key, label]) => <label key={key}>{label}<input disabled={busy} type="number" min={0} required value={value[key]} onChange={event => setValue({ ...value, [key]: Number(event.target.value) })} /></label>)}</details>
        <label className="check-row team-enabled"><input disabled={busy} type="checkbox" checked={value.enabled} onChange={event => setValue({ ...value, enabled: event.target.checked })} />{t('translation.enable')}</label>
        <button type="submit" className="primary" disabled={busy}>{busy ? t('team.saving') : t('translation.save')}</button>
      </form>}
      {error && <p className="team-error" role="alert">{error}</p>}
      {admin && <section className="team-usage"><h3>{t('translation.backfill')}</h3><p className="team-form-help">{t('translation.backfillHint', { limit: 100 })} {t('translation.cached', { count: admin.cached })}</p>
        <div className="live-actions">{(['es', 'en'] as const).map(target => <button key={target} type="button" disabled={busy} onClick={() => void runBackfill(target)}><Languages size={15} aria-hidden="true" />{t('translation.backfillRun', { language: LOCALE_NAMES[target] })}</button>)}</div>
        {backfill && <p role="status">{backfill.done ? t('translation.backfillDone') : t('translation.backfillResult', { processed: backfill.processedRecords, total: backfill.totalRecords, translated: backfill.translated, unavailable: backfill.unavailable })}</p>}
        <h3>{t('translation.usage')}</h3>
        {admin.usage.length > 0 ? <ul className="live-records team-usage-list">{admin.usage.slice(0, 20).map((item, index) => <li key={index}><div><time dateTime={new Date(Number(item.created_at)).toISOString()}>{formatDateTime(locale, Number(item.created_at))}</time><span>{String(item.status)}</span></div><p>{String(item.input_tokens)} / {String(item.output_tokens)} · {String(item.cost_cents)}¢</p></li>)}</ul> : <p className="team-form-help">{t('translation.usageEmpty')}</p>}
      </section>}
    </section>}
    <GlossaryPanel app={app} />
  </>;
}
/** Owner and managers maintain the glossary; everyone can read it through the snapshot. */
export function GlossaryPanel({ app }: { app: ModuleProps }) {
  const t = useT(), manage = useCan('translation.manage'), { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<Partial<GlossaryTerm> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const terms = [...(app.snapshot.translationGlossary ?? [])].sort((a, b) => a.en.localeCompare(b.en));
  const save = async () => {
    if (!editing?.en?.trim() || !editing.es?.trim()) return;
    setBusy(true);
    const message = await runCommand(app, { type: 'glossary.save', ...(editing.id ? { id: editing.id } : {}), en: editing.en.trim(), es: editing.es.trim(), note: (editing.note ?? '').trim() });
    setBusy(false); setError(message ?? '');
    if (!message) { setEditing(null); app.onSaved(t('translation.glossarySaved')); }
  };
  const remove = async (term: GlossaryTerm) => {
    if (!await confirm({ title: t('translation.glossaryRemove'), message: `${term.en} → ${term.es}`, confirmLabel: t('translation.glossaryRemove'), danger: true })) return;
    setBusy(true); const message = await runCommand(app, { type: 'glossary.remove', id: term.id }); setBusy(false); setError(message ?? '');
  };
  return <section className="card team-settings"><header className="team-section-heading"><div><h2>{t('translation.glossary')}</h2><p className="team-form-help">{t('translation.glossaryHint')}</p></div>{manage && !editing && <button type="button" onClick={() => setEditing({ en: '', es: '', note: '' })}><Plus size={15} aria-hidden="true" />{t('translation.glossaryAdd')}</button>}</header>
    {!terms.length && !editing && <p className="empty-state">{t('translation.glossaryEmpty')}</p>}
    <ul className="live-records">{terms.map(term => <li key={term.id}><div><strong>{term.en}</strong> → <strong>{term.es}</strong>{term.note && <p className="muted">{term.note}</p>}</div>{manage && <div className="live-actions"><button type="button" disabled={busy} onClick={() => setEditing(term)}>{t('translation.glossaryEdit')}</button><button type="button" disabled={busy} onClick={() => void remove(term)}>{t('translation.glossaryRemove')}</button></div>}</li>)}</ul>
    {editing && <form className="team-form-grid" data-form-dirty onSubmit={event => { event.preventDefault(); void save(); }}>
      <label>{t('translation.glossaryEn')}<input required maxLength={80} value={editing.en ?? ''} onChange={e => setEditing({ ...editing, en: e.target.value })} /></label>
      <label>{t('translation.glossaryEs')}<input required maxLength={80} value={editing.es ?? ''} onChange={e => setEditing({ ...editing, es: e.target.value })} /></label>
      <label>{t('translation.glossaryNote')}<input maxLength={300} value={editing.note ?? ''} onChange={e => setEditing({ ...editing, note: e.target.value })} /></label>
      <div className="live-actions"><button type="submit" className="work-primary" disabled={busy}>{t('templates.save')}</button><button type="button" onClick={() => setEditing(null)}>{t('templates.cancel')}</button></div>
    </form>}
    {error && <p role="alert" className="work-error">{error}</p>}
    {dialog}
  </section>;
}

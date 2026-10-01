// P13: user-written text in the viewer's language. The original is always one tap away; a doubtful or missing translation
// never pretends to be one; corrections and stated languages go to the server through the same authenticated service.
import { useState, type ElementType } from 'react';
import { Languages, RefreshCw } from 'lucide-react';
import type { TranslatableKind } from '@pirata/contracts/index';
import { useT, useLocale, LOCALE_NAMES } from '../i18n';
import { useTranslated } from '../i18n/translated';
import { errorMessage } from '../i18n/errors';
import { useServer } from '../state/serverContext';
import { WorkDialog } from '../features/tasks-time/WorkDialog';
import './translated.css';

export interface TranslatedTextProps { kind: TranslatableKind; id: string; field: string; text: string; as?: ElementType; className?: string; /** Lists and titles: no chip or controls, the original in `title`. */ compact?: boolean }
export function TranslatedText({ kind, id, field, text, as: Tag = 'span', className = '', compact = false }: TranslatedTextProps) {
  const t = useT(), locale = useLocale(), { store } = useServer();
  const translated = useTranslated(kind, id, field, text);
  const [showOriginal, setShowOriginal] = useState(false), [showTranslation, setShowTranslation] = useState(false), [report, setReport] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const classes = (className + ' translated-text translated-' + translated.status).trim();
  if (!text.trim()) return <Tag className={className}>{text}</Tag>;
  const stateLanguage = async (stated: 'en' | 'es') => {
    setBusy(true); setError('');
    try { await store.service.call('translations/source', { kind, id, field, locale: stated }); await store.refresh(); translated.retry(); }
    catch (cause) { setError(errorMessage(locale, cause)); }
    finally { setBusy(false); }
  };
  if (translated.isTranslated) {
    if (compact) return <Tag className={classes} title={translated.original} data-translated="true" lang={locale}>{showOriginal ? translated.original : translated.text}</Tag>;
    return <Tag className={classes} data-translated="true">
      <span className="translated-body" lang={showOriginal ? undefined : locale}>{showOriginal ? translated.original : translated.text}</span>
      <span className="translated-tools">
        <span className="translated-chip" title={translated.status === 'corrected' ? t('shell.translated.corrected') : t('shell.translated.chip')}><Languages size={12} aria-hidden="true" />{showOriginal ? t('shell.translated.original') : t('shell.translated.chip')}</span>
        <button type="button" className="translated-link" onClick={() => setShowOriginal(open => !open)}>{showOriginal ? t('shell.translated.viewTranslation') : t('shell.translated.viewOriginal')}</button>
        <button type="button" className="translated-link" onClick={() => setReport(true)}>{t('shell.translated.report')}</button>
      </span>
      {report && <TranslationCorrectionDialog kind={kind} id={id} field={field} original={translated.original} translation={translated.text} onClose={() => setReport(false)} onDone={() => { setReport(false); translated.retry(); }} />}
    </Tag>;
  }
  if (translated.status === 'unsure' && !compact) {
    return <Tag className={classes}>
      <span className="translated-body">{showTranslation && translated.translation ? translated.translation : translated.original}</span>
      <span className="translated-tools">
        {translated.translation && <button type="button" className="translated-link" onClick={() => setShowTranslation(open => !open)}>{showTranslation ? t('shell.translated.viewOriginal') : t('shell.translated.showTranslation')}</button>}
        <span className="translated-unsure">{t('shell.translated.writtenIn')}</span>
        {(['en', 'es'] as const).map(code => <button key={code} type="button" className="translated-link" disabled={busy} onClick={() => void stateLanguage(code)}>{LOCALE_NAMES[code]}</button>)}
      </span>
      {error && <span role="alert" className="work-error">{error}</span>}
    </Tag>;
  }
  if (translated.status === 'unavailable' && !compact && translated.reason !== 'missing') {
    return <Tag className={classes}><span className="translated-body">{translated.original}</span><span className="translated-tools"><span className="translated-unsure">{t('shell.translated.unavailable')}</span><button type="button" className="translated-link" onClick={() => translated.retry()}><RefreshCw size={12} aria-hidden="true" />{t('shell.translated.retry')}</button></span></Tag>;
  }
  return <Tag className={classes} data-translation={translated.status === 'pending' ? 'pending' : undefined}>{translated.original}</Tag>;
}

/** Report or correct a translation. Saves a corrected rendition; the original text is never changed here. */
export function TranslationCorrectionDialog({ kind, id, field, original, translation, onClose, onDone }: { kind: TranslatableKind; id: string; field: string; original: string; translation: string; onClose(): void; onDone(): void }) {
  const t = useT(), locale = useLocale(), { store } = useServer();
  const [text, setText] = useState(translation), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError('');
    try { await store.service.call('translations/correct', { kind, id, field, target: locale, text: text.trim() }); await store.refresh(); onDone(); }
    catch (cause) { setError(errorMessage(locale, cause)); }
    finally { setBusy(false); }
  };
  return <WorkDialog title={t('shell.translated.reportTitle')} onClose={onClose}>
    <p className="muted">{t('shell.translated.reportHint')}</p>
    <p className="translated-original-block"><strong>{t('shell.translated.original')}</strong><br />{original}</p>
    <label className="work-field">{t('shell.translated.corrected')}<textarea rows={4} maxLength={8000} value={text} onChange={e => setText(e.target.value)} /></label>
    {error && <p role="alert" className="work-error">{error}</p>}
    <div className="live-actions"><button type="button" className="work-primary" disabled={busy || !text.trim()} onClick={() => void save()}>{t('shell.translated.save')}</button><button type="button" onClick={onClose}>{t('shell.confirm.cancel')}</button></div>
  </WorkDialog>;
}

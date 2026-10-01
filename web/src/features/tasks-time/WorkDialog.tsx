import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useT } from '../../i18n';
import './styles.css';

/** Native dialog adapted for requests whose outcome must be resolved before closing. */
export function WorkDialog({ title, onClose, children, backLabel, initialFocusSelector, className = '' }: { title: string; onClose(): void; children: ReactNode; backLabel?: string; initialFocusSelector?: string; className?: string }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null), dirty = useRef(false), titleId = useId();
  const [discard, setDiscard] = useState(false), [notice, setNotice] = useState('');
  useLayoutEffect(() => {
    const dialog = ref.current!, opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    dialog.showModal();
    const saveSelector = '[data-save-phase="saving"], [data-save-phase="uncertain"], [data-save-phase="saved"]';
    const observer = new MutationObserver(() => { if (!dialog.querySelector(saveSelector)) setNotice(''); });
    observer.observe(dialog, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-save-phase'] });
    const field = [...dialog.querySelectorAll<HTMLElement>('input, select, textarea')].find(element => element.getClientRects().length > 0 && !element.matches(':disabled'));
    ((initialFocusSelector ? dialog.querySelector<HTMLElement>(initialFocusSelector) : null) ?? field ?? dialog.querySelector<HTMLElement>('button'))?.focus();
    return () => { observer.disconnect(); dialog.close(); requestAnimationFrame(() => { if (opener?.isConnected) opener.focus({preventScroll:true}); else document.getElementById('main')?.focus(); }); };
  }, [initialFocusSelector]);
  function close() {
    const saving = ref.current?.querySelector<HTMLElement>('[data-save-phase="saving"], [data-save-phase="uncertain"], [data-save-phase="saved"]');
    const phase = saving?.dataset.savePhase;
    if (phase === 'saving' || phase === 'uncertain' || phase === 'saved') {
      setNotice(saving?.dataset.saveNotice ?? (phase === 'saved' ? t('shell.form.savedNotice') : t('shell.form.keepOpen'))); return;
    }
    if (dirty.current || ref.current?.querySelector('[data-form-dirty="true"]')) setDiscard(true); else onClose();
  }
  return <dialog className={'work-module work-dialog '+className} ref={ref} aria-labelledby={titleId}
    onCancel={e => { if(e.target !== e.currentTarget) return; e.preventDefault(); close(); }} onInput={e => { const target = e.target as HTMLElement; if(target.closest('dialog') === e.currentTarget && !target.closest('form[data-form-dirty], [data-non-draft]')) dirty.current = true; }} onChange={e => { const target = e.target as HTMLElement; if(target.closest('dialog') === e.currentTarget && !target.closest('form[data-form-dirty], [data-non-draft]')) dirty.current = true; }}
    onClick={e => { const target = e.target as HTMLElement; if(target.closest('dialog') !== e.currentTarget) return; if (target.closest('[data-dirty]')&&!target.closest('form[data-form-dirty], [data-non-draft]')) dirty.current = true; if (target.closest('[data-cancel]')) close(); }}>
    <header className="work-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" className="work-dialog-close" aria-label={t('shell.form.close')} onClick={close}><X size={20} aria-hidden="true" /></button></header>
    {discard && <section className="work-dialog-body" role="alert"><h3>{t('shell.form.discardTitle')}</h3><p>{t('shell.form.discardBody')}</p><div className="work-actions"><button autoFocus onClick={() => setDiscard(false)}>{t('shell.form.keepEditing')}</button><button onClick={onClose}>{t('shell.form.discard')}</button></div></section>}
    <div className="work-dialog-body" hidden={discard}>{backLabel && <div className="work-actions"><button type="button" className="dialog-back" onClick={close}><ArrowLeft size={18} aria-hidden="true" />{backLabel}</button></div>}{notice && <p role="status">{notice}</p>}{children}</div>
  </dialog>;
}

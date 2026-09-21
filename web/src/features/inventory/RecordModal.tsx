import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native dialog with explicit handling for asynchronous/uncertain server saves. */
export function RecordModal({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null), dirty = useRef(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const [discard, setDiscard] = useState(false), [notice, setNotice] = useState('');
  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); else document.getElementById('main')?.focus(); };
  }, []);
  useLayoutEffect(() => {
    dirty.current = false;
    const dialog = dialogRef.current!;
    (dialog.querySelector<HTMLElement>('[data-autofocus], input, select, textarea') ?? dialog.querySelector<HTMLElement>('button'))?.focus();
  }, [title]);
  function canLeave() {
    const phase = dialogRef.current?.querySelector<HTMLFormElement>('form[data-save-phase]')?.dataset.savePhase;
    if (phase === 'saving' || phase === 'uncertain' || phase === 'saved') {
      setNotice(phase === 'saved' ? 'This record is saved. Reload the saved record before closing.' : phase === 'saving' ? 'Saving is in progress. Keep this dialog open until the result arrives.' : 'The save outcome is not confirmed. Use Retry same save before closing so the original request stays available.');
      return false;
    }
    return true;
  }
  function requestClose() {
    if (!canLeave()) return;
    if (dirty.current) { pendingNavigation.current = onClose; setDiscard(true); }
    else onClose();
  }
  return <dialog ref={dialogRef} className="iv-module iv-modal" aria-labelledby="iv-dialog-title"
    onCancel={event => { event.preventDefault(); requestClose(); }}
    onInput={() => { dirty.current = true; }} onChange={() => { dirty.current = true; }}
    onClickCapture={event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-navigate]');
      if (button && dirty.current) {
        event.preventDefault(); event.stopPropagation();
        if (!canLeave()) return;
        pendingNavigation.current = () => { dirty.current = false; button.click(); };
        setDiscard(true);
      }
    }}
    onClick={event => {
      if ((event.target as HTMLElement).closest('[data-navigate]')) { dirty.current = false; setNotice(''); }
      if ((event.target as HTMLElement).closest('[data-cancel]')) requestClose();
    }}>
    <div className="modal-header"><h2 id="iv-dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={requestClose}><X size={22} /></button></div>
    {discard && <div className="discard-panel" role="alert"><h3>Discard unsaved changes?</h3><p>Your draft has not been saved.</p><div className="actions"><button className="secondary" autoFocus onClick={() => { setDiscard(false); pendingNavigation.current = null; }}>Keep editing</button><button className="danger" onClick={() => { setDiscard(false); pendingNavigation.current?.(); pendingNavigation.current = null; }}>Discard changes</button></div></div>}
    <div className="modal-body" hidden={discard}>{notice && <p className="info-panel" role="status">{notice}</p>}{children}</div>
  </dialog>;
}

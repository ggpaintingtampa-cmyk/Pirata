import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const [discard, setDiscard] = useState(false);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => { dialog.close(); const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>('.add-button') ?? document.getElementById('main'); target?.focus(); };
  }, []);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    (dialog.querySelector<HTMLElement>('[data-autofocus], input, select, textarea') ?? dialog.querySelector<HTMLElement>('button'))?.focus();
  }, [title]);
  function requestClose() {
    if (dirty.current) { pending.current = onClose; setDiscard(true); }
    else onClose();
  }
  return <dialog ref={ref} className="modal" aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); requestClose(); }} onInput={() => { dirty.current = true; }} onChange={() => { dirty.current = true; }}
    onClickCapture={event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-navigate]');
      if (button && dirty.current) {
        event.preventDefault(); event.stopPropagation();
        // Capture its handler by replaying while the original form remains mounted.
        pending.current = () => { dirty.current = false; button.click(); };
        setDiscard(true);
      }
    }}
    onClick={event => {
      if ((event.target as HTMLElement).closest('[data-dirty]')) dirty.current = true;
      if ((event.target as HTMLElement).closest('[data-clean], [data-navigate]')) dirty.current = false;
      if ((event.target as HTMLElement).closest('[data-cancel]')) requestClose();
    }}>
    <div className="modal-header"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={requestClose}><X size={22} /></button></div>
    {discard && <div className="discard-panel" role="alert"><h3>Discard unsaved changes?</h3><p>Your edits have not been saved.</p><div className="actions"><button autoFocus className="secondary" onClick={() => { setDiscard(false); pending.current = null; }}>Keep editing</button><button className="danger" onClick={() => { setDiscard(false); pending.current?.(); pending.current = null; }}>Discard changes</button></div></div>}
    <div className="modal-body" hidden={discard}>{children}</div>
  </dialog>;
}

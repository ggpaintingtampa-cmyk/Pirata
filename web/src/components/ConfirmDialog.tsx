// P13: confirmation prompts are app text, so the message and both buttons come from the dictionaries (window.confirm
// rendered its buttons in the device language). `useConfirm` keeps the call sites as simple as the old boolean prompt.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { WorkDialog } from '../features/tasks-time/WorkDialog';
export interface ConfirmOptions { title: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger = false, onConfirm, onClose }: ConfirmOptions & { onConfirm(): void; onClose(): void }) {
  const t = useT();
  return <WorkDialog title={title} onClose={onClose} initialFocusSelector="[data-confirm]">
    <div className="work-dialog-confirm">{typeof message === 'string' ? <p>{message}</p> : message}</div>
    <div className="live-actions"><button type="button" data-confirm className={danger ? 'danger' : 'work-primary'} onClick={onConfirm}>{confirmLabel ?? t('shell.confirm.ok')}</button><button type="button" onClick={onClose}>{cancelLabel ?? t('shell.confirm.cancel')}</button></div>
  </WorkDialog>;
}
/** `const { confirm, dialog } = useConfirm(); if (!await confirm({...})) return;` and render `{dialog}` once. */
export function useConfirm(): { confirm(options: ConfirmOptions): Promise<boolean>; dialog: ReactNode } {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const settle = useCallback((value: boolean) => { resolver.current?.(value); resolver.current = null; setPending(null); }, []);
  const confirm = useCallback((options: ConfirmOptions) => { resolver.current?.(false); return new Promise<boolean>(resolve => { resolver.current = resolve; setPending(options); }); }, []);
  const dialog = pending ? <ConfirmDialog {...pending} onConfirm={() => settle(true)} onClose={() => settle(false)} /> : null;
  return { confirm, dialog };
}

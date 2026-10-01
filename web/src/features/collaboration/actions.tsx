import { useRef, useState } from 'react';
import { tx } from '../../i18n';
import type { BusinessCommand, MutationRequest } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { createMutation, ServiceError } from '../../services/api';

/** Keep one intent across connection failures and acknowledge before refreshing. */
export function useCommand(app: ModuleProps) {
  const active = useRef<{ request: MutationRequest; acknowledged: boolean; done?: () => void } | null>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  async function run(command?: BusinessCommand, done?: () => void) {
    if (locked.current) return;
    if (!active.current && command) active.current = { request: createMutation(command, app.snapshot.revision), acknowledged: false, done };
    if (!active.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      if (!active.current.acknowledged) { await app.service.execute(active.current.request); active.current.acknowledged = true; }
      await app.refresh(); const callback = active.current.done; active.current = null; setUncertain(false); callback?.(); return 'saved' as const;
    } catch (cause) {
      if (cause instanceof ServiceError && [400, 404, 409, 422].includes(cause.status)) {
        active.current = null; setUncertain(false); setError(cause.code === 'REVISION_CONFLICT' ? 'The shared records changed. Your draft is retained. Review it and save again.' : cause.message);
        if (cause.code === 'REVISION_CONFLICT') await app.refresh().catch(() => {});
        return 'rejected' as const;
      } else { setUncertain(true); setError(active.current?.acknowledged ? 'Saved. Retry to reload the updated records.' : 'The save could not be confirmed. Retry this same save to avoid a duplicate.'); return 'uncertain' as const; }
    } finally { locked.current = false; setBusy(false); }
  }
  return { run, busy, error, uncertain };
}
export function ActionStatus({ action }: { action: ReturnType<typeof useCommand> }) { return <>{action.error && <p role="alert" className="co-error">{action.error}</p>}{action.uncertain && <button disabled={action.busy} type="button" onClick={() => void action.run()}>{tx('Retry same save')}</button>}</>; }

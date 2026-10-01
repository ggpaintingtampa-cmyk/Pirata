// P12: reviewable order proposals for one task list. Before/after columns, reasons and assumptions; applying is one
// reviewed command on the server; a stale proposal is refused and a fresh one can be requested; Undo uses the stored envelope.
import { useEffect, useState } from 'react';
import type { OrderProposal } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { ServiceError } from '../../services/api';
import { useT, useLocale } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { useServer } from '../../state/serverContext';
import { WorkDialog } from '../tasks-time/WorkDialog';
import './styles.css';
type Phase = { kind: 'loading' } | { kind: 'ready'; proposal: OrderProposal } | { kind: 'applied'; proposal: OrderProposal; option: number } | { kind: 'error'; code: string; message: string };
export function OrderSuggestionsDialog({ app, projectId, parentTaskId, onClose }: { app: ModuleProps; projectId: string; parentTaskId: string | null; onClose(): void }) {
  const t = useT(), locale = useLocale(), { store } = useServer();
  // The answer is keyed by its request id, so a fresh request shows the loading line without a synchronous reset in the effect.
  const [answer, setAnswer] = useState<{ requestId: string; phase: Phase }>({ requestId: '', phase: { kind: 'loading' } }), [busy, setBusy] = useState(false), [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const phase: Phase = answer.requestId === requestId ? answer.phase : { kind: 'loading' };
  const setPhase = (next: Phase) => setAnswer({ requestId, phase: next });
  const titleOf = (id: string) => app.snapshot.tasks.find(task => task.id === id)?.title ?? '—';
  useEffect(() => {
    let active = true;
    void store.service.call<OrderProposal>('ask/order/suggest', { requestId, projectId, parentTaskId }).then(proposal => { if (active) setAnswer({ requestId, phase: { kind: 'ready', proposal } }); })
      .catch(cause => { if (!active) return; const code = cause instanceof ServiceError ? cause.code : 'NETWORK'; setAnswer({ requestId, phase: { kind: 'error', code, message: errorMessage(locale, cause) } }); });
    return () => { active = false; };
  }, [requestId, projectId, parentTaskId, store, locale]);
  const apply = async (proposal: OrderProposal, option: number) => {
    setBusy(true);
    try { await store.service.call('ask/order/apply', { reviewId: proposal.reviewId, optionIndex: option }); await app.refresh(); app.onSaved(t('ordering.applied')); setPhase({ kind: 'applied', proposal, option }); }
    catch (cause) { const code = cause instanceof ServiceError ? cause.code : 'NETWORK'; setPhase({ kind: 'error', code, message: code === 'REVISION_CONFLICT' || code === 'ORDER_STALE' ? t('ordering.stale') : errorMessage(locale, cause) }); }
    finally { setBusy(false); }
  };
  const undo = async (proposal: OrderProposal) => {
    setBusy(true);
    try { await store.service.call('ask/order/undo', { reviewId: proposal.reviewId }); await app.refresh(); app.onSaved(t('ordering.undone')); setPhase({ kind: 'ready', proposal }); }
    catch (cause) { setPhase({ kind: 'error', code: cause instanceof ServiceError ? cause.code : 'NETWORK', message: errorMessage(locale, cause) }); }
    finally { setBusy(false); }
  };
  const refresh = async () => { try { await app.refresh(); } catch { /* the new request reports */ } setRequestId(crypto.randomUUID()); };
  return <WorkDialog title={t('ordering.title')} onClose={onClose} className="ordering-dialog">
    <p className="muted">{t('ordering.intro')}</p>
    {phase.kind === 'loading' && <p role="status">{t('ordering.loading')}</p>}
    {phase.kind === 'error' && <div className="work-error" role="alert"><p>{phase.code === 'ASK_DISABLED' || phase.code === 'ASK_LIMIT' ? t('ordering.disabled') : phase.code === 'ORDER_TOO_SMALL' ? t('ordering.tooSmall') : phase.code === 'REVISION_CONFLICT' || phase.code === 'ORDER_STALE' ? t('ordering.stale') : phase.message || t('ordering.failed')}</p><div className="live-actions">{phase.code !== 'ASK_DISABLED' && phase.code !== 'ORDER_TOO_SMALL' && <button type="button" disabled={busy} onClick={() => void refresh()}>{t('ordering.refresh')}</button>}<button type="button" onClick={onClose}>{t('ordering.close')}</button></div></div>}
    {(phase.kind === 'ready' || phase.kind === 'applied') && <>
      {phase.proposal.fixed.length > 0 && <p className="muted">{t('ordering.fixed')}</p>}
      {phase.proposal.options.map((option, index) => <section key={index} className={'ordering-option' + (phase.kind === 'applied' && phase.option === index ? ' is-applied' : '')}>
        <h3>{option.name}</h3>
        <div className="ordering-columns">
          <div><h4>{t('ordering.before')}</h4><ol>{phase.proposal.current.filter(id => !phase.proposal.fixed.includes(id)).map(id => <li key={id}>{titleOf(id)}</li>)}</ol></div>
          <div><h4>{t('ordering.after')}</h4><ol>{option.orderedIds.map(id => <li key={id}>{titleOf(id)}</li>)}</ol></div>
        </div>
        {option.reasons.length > 0 && <p><strong>{t('ordering.reasons')}:</strong> {option.reasons.join(' · ')}</p>}
        {option.assumptions.length > 0 && <p className="muted"><strong>{t('ordering.assumptions')}:</strong> {option.assumptions.join(' · ')}</p>}
        <div className="live-actions">{phase.kind === 'applied' && phase.option === index
          ? <button type="button" disabled={busy} onClick={() => void undo(phase.proposal)}>{t('ordering.undo')}</button>
          : phase.kind === 'ready' && <button type="button" className="work-primary" disabled={busy} onClick={() => void apply(phase.proposal, index)}>{t('ordering.apply')}</button>}</div>
      </section>)}
      <div className="live-actions"><button type="button" onClick={onClose}>{t('ordering.close')}</button></div>
    </>}
  </WorkDialog>;
}

// P05: a compact manual refresh for the page toolbar. Forms own their drafts and views own their day and filter
// state, so a refresh never resets either; it only asks the store for a newer acknowledged snapshot.
import { useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { useT } from '../i18n';
import { useServer } from '../state/serverContext';
type Phase = 'idle' | 'busy' | 'done' | 'failed' | 'offline';
export function RefreshButton({ announce }: { announce?(message: string): void }) {
  const t = useT(), { store } = useServer(), [phase, setPhase] = useState<Phase>('idle'), timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const click = async () => {
    if (phase === 'busy') return;
    setPhase('busy');
    const result = await store.refreshNow();
    const next: Phase = result === 'ok' ? 'done' : result;
    setPhase(next);
    announce?.(t(next === 'done' ? 'shell.refresh.done' : next === 'offline' ? 'shell.refresh.offline' : 'shell.refresh.failed'));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPhase('idle'), next === 'done' ? 1500 : 4000);
  };
  const title = phase === 'offline' ? t('shell.refresh.offline') : phase === 'failed' ? t('shell.refresh.failed') : phase === 'done' ? t('shell.refresh.done') : t('shell.refresh');
  return <button type="button" className={'refresh-button is-' + phase} aria-label={t('shell.refresh')} aria-busy={phase === 'busy'} title={title} data-testid="refresh-button" onClick={() => void click()}>
    {phase === 'done' ? <Check size={16} aria-hidden="true" /> : phase === 'offline' ? <WifiOff size={16} aria-hidden="true" /> : phase === 'failed' ? <TriangleAlert size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
  </button>;
}

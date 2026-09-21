import type { CSSProperties } from 'react';
import { completionPercent } from '@pirata/contracts/progress';

/** A live progress indicator; the fraction always comes from the shared domain rules. */
export function CompletionRing({ fraction, label, size = 80, success = false }: {
  fraction: number; label: string; size?: number; success?: boolean;
}) {
  const value = Math.max(0, Math.min(1, fraction));
  return <div className={'completion-dial' + (success ? ' completion-dial-success' : '')}
    role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPercent(value)}
    style={{ '--completion': `${value * 100}%`, '--dial-size': `${size}px` } as CSSProperties}>
    <span>{completionPercent(value)}%</span>
  </div>;
}

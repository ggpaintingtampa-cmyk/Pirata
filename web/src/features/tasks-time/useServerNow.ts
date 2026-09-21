import { useEffect, useState } from 'react';
import type { BusinessSnapshot } from '@pirata/contracts/index';
/** performance.now is monotonic: the phone's wall clock never timestamps work. */
export function useServerNow(snapshot: BusinessSnapshot) {
  const [tick, setTick] = useState({ snapshot, elapsed: 0 });
  useEffect(() => {
    const anchor = performance.now();
    const interval = window.setInterval(() => setTick({ snapshot, elapsed: performance.now() - anchor }), 1000);
    return () => window.clearInterval(interval);
  }, [snapshot]);
  return snapshot.serverNow + (tick.snapshot === snapshot ? tick.elapsed : 0);
}

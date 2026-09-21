import { AlertTriangle, Download } from 'lucide-react';
import { useApp } from '../state/AppProvider';
export function StorageNotice() {
  const { snapshot, store, setDialog } = useApp();
  if (snapshot.mode === 'ready' && !snapshot.error) return null;
  function download() {
    const url = URL.createObjectURL(new Blob([snapshot.raw ?? ''], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = 'morgan-el-pirata-stored-data.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <aside className="storage-notice" aria-label="Storage status" role={snapshot.error ? 'alert' : undefined}><AlertTriangle size={20} aria-hidden="true" /><div>
    <strong>{snapshot.mode === 'memory' ? 'Memory-only demo — changes will be lost on reload.' : snapshot.mode === 'conflict' ? 'This demo changed in another tab. Reload to continue.' : snapshot.mode === 'recovery' ? 'Your stored data needs recovery' : snapshot.mode === 'unavailable' ? 'Saving is unavailable' : 'Changes were not saved'}</strong>
    {snapshot.error && snapshot.mode !== 'conflict' && <p>{snapshot.error}</p>}
    <div className="actions">
      {snapshot.mode === 'unavailable' && <button className="secondary" onClick={() => store.useMemory()}>Use in-memory demo</button>}
      {snapshot.mode === 'recovery' && <><button className="secondary" onClick={download}><Download size={18} />Download stored content</button><button className="secondary" onClick={() => setDialog({ kind: 'demo' })}>Reset options</button></>}
      {snapshot.mode === 'conflict' && <button className="secondary" onClick={() => window.location.reload()}>Reload to continue</button>}
    </div>
  </div></aside>;
}

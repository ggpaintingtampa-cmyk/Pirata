import { useState } from 'react';
import { useApp } from '../../state/AppProvider';
export function DemoInfoDialog() {
  const { snapshot, store, setDialog, setAnnouncement, setSelectedTaskId } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  function downloadDemo() {
    if (!snapshot.data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot.data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'pirata-browser-demo-v1.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement('Demo export downloaded. Your browser records are unchanged.');
  }
  return <><p className="dialog-intro">A small space to try your working day.</p><p>Projects, contacts, commitments, and purchases are fabricated sample data. This prototype includes Today and its dialogs.</p><p>Changes are stored in this browser at this address. They do not sync across devices. Use one tab; browser data can be cleared and is not a production backup.</p><p>A running timer keeps counting while the page is closed, until you pause it. Time is calculated from saved timestamps.</p>{snapshot.data && <p className="muted">Sample day: {snapshot.data.seededOn}. Today uses America/New_York. Old records stay on their original dates.</p>}
    {snapshot.mode === 'memory' && <p className="inline-warning">Memory-only mode: changes will be lost on reload.</p>}
    {snapshot.data && <><button className="secondary wide-button" onClick={downloadDemo}>Download demo export</button><p className="muted">Keep this v1 JSON file for recovery or explicitly import it into an empty live workspace. Importing never happens automatically.</p></>}
    {confirming ? <div className="reset-confirm" role="alert"><h3>Reset this demo?</h3><p>This replaces all records and any running timer for this prototype with fresh samples for today. Only this application's storage key is replaced.</p><div className="actions"><button className="secondary" onClick={() => setConfirming(false)}>Keep my data</button><button className="danger" onClick={() => {
      const result = store.reset(); if (result.ok) { setSelectedTaskId('t-prep'); setAnnouncement('Demo data reset for today.'); setDialog(null); } else setError(result.error);
    }}>Confirm reset</button></div></div> : <button className="secondary danger-text wide-button" disabled={snapshot.mode === 'conflict' || snapshot.mode === 'unavailable'} onClick={() => setConfirming(true)}>Reset demo data</button>}
    {error && <p className="field-error" role="alert">{error}</p>}<div className="form-footer"><button className="secondary" data-cancel>Close</button></div>
  </>;
}

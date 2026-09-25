import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { ModuleProps } from '../../services/moduleProps';
import { teamRequest } from '../../services/teamApi';
interface AISettings { enabled: boolean; model: string; dailyRequests: number; monthlyBudgetCents: number; inputCentsPerMillion: number; outputCentsPerMillion: number }
export function AISettingsView(app: ModuleProps) {
  const [value, setValue] = useState<AISettings | null>(null), [keyConfigured, setKey] = useState(false);
  const [usage, setUsage] = useState<Record<string, unknown>[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [original, setOriginal] = useState('');
  useEffect(() => {
    let active = true;
    void teamRequest({ service: app.service }, 'admin/ai').then(data => { if (active) { setValue(data.settings); setOriginal(JSON.stringify(data.settings)); setKey(data.keyConfigured); setUsage(data.usage); } }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [app.service]);
  return <section className="card team-settings team-figma" data-save-phase={busy ? 'saving' : 'editing'}>
    <header className="team-section-heading"><div><p className="team-eyebrow">AI assistant · Owner</p><h2>Ask settings & usage</h2></div>{value && <span className="team-counter">{value.enabled && keyConfigured ? 'Enabled' : 'Paused'}</span>}</header>
    {value ? <div className="team-key-status"><KeyRound size={20} aria-hidden="true" /><div><strong>API key: {keyConfigured ? 'Configured privately on the server' : 'Not configured'}</strong><p>Set the server secret file first; never paste the key into this form.</p></div></div> : !error && <p role="status">Loading your Ask settings…</p>}
    {value && <form data-form-dirty={JSON.stringify(value) !== original} onSubmit={event => {
      event.preventDefault(); setBusy(true); setError('');
      void teamRequest(app, 'admin/ai', value).then(() => { setOriginal(JSON.stringify(value)); app.onSaved('Ask settings saved.'); }).catch(cause => setError(cause.message)).finally(() => setBusy(false));
    }}>
      <label>API model<input disabled={busy} value={value.model} onChange={event => setValue({ ...value, model: event.target.value })} placeholder="Configured provider model ID" /></label>
      <div className="team-form-grid">{([['dailyRequests', 'Daily request limit'], ['monthlyBudgetCents', 'Monthly budget (US cents)']] as const).map(([key, label]) => <label key={key}>{label}<input disabled={busy} type="number" min={0} required value={value[key]} onChange={event => setValue({ ...value, [key]: Number(event.target.value) })} /></label>)}</div>
      <details className="team-advanced"><summary>Model pricing and usage limits</summary><p>Confirm current token rates in your provider account. Limits are shared by the team, using UTC days and months. Failed calls retain a conservative reservation.</p>{([['inputCentsPerMillion', 'Input price (US cents per million tokens)'], ['outputCentsPerMillion', 'Output price (US cents per million tokens)']] as const).map(([key, label]) => <label key={key}>{label}<input disabled={busy} type="number" min={0} required value={value[key]} onChange={event => setValue({ ...value, [key]: Number(event.target.value) })} /></label>)}</details>
      <label className="check-row team-enabled"><input disabled={busy} type="checkbox" checked={value.enabled} onChange={event => setValue({ ...value, enabled: event.target.checked })} />Enable live Ask requests</label>
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save Ask settings'}</button>
    </form>}
    {error && <p className="team-error" role="alert">{error}</p>}
    <section className="team-usage"><h3>Recent usage</h3><div className="team-usage-metrics"><div><strong>{usage.length}</strong><span>recent requests</span></div><div><strong>{usage.reduce((total, item) => total + Number(item.cost_cents ?? 0), 0)}¢</strong><span>recorded</span></div><div><strong>{usage.reduce((total, item) => total + Number(item.reserved_cents ?? 0), 0)}¢</strong><span>reserved</span></div></div>
      {usage.length > 0 ? <ul className="live-records team-usage-list">{usage.slice(0, 20).map((item, index) => <li key={index}><div><time dateTime={new Date(Number(item.created_at)).toISOString()}>{new Date(Number(item.created_at)).toLocaleString()}</time><span>{String(item.status)}</span></div><p>{String(item.input_tokens)} input / {String(item.output_tokens)} output tokens</p></li>)}</ul> : <p className="team-form-help">Your team’s requests will appear here.</p>}
    </section>
  </section>;
}

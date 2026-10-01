// Update 2026-09-29 (P10): owner-managed work-feed tokens for Camino. The subject account is chosen explicitly, never
// matched by name; the plaintext token is shown once, here, and never stored or shown again.
import { useEffect, useState } from 'react';
import { Copy, Link2, Plus, ShieldOff } from 'lucide-react';
import type { IntegrationScope, IntegrationTokenSummary } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, useLocale } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { formatDateTime } from '../../i18n/locale';
import { useCan } from '../../state/permissions';
import { useServer } from '../../state/serverContext';
import { useConfirm } from '../../components/ConfirmDialog';
export function ConnectionsView(app: ModuleProps) {
  const t = useT(), locale = useLocale(), owner = useCan('integration.admin'), { store } = useServer(), { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<IntegrationTokenSummary[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loadKey, setLoadKey] = useState(0);
  const [label, setLabel] = useState(''), [subject, setSubject] = useState(app.snapshot.currentUser?.id ?? ''), [complete, setComplete] = useState(true), [created, setCreated] = useState<{ token: string; label: string } | null>(null);
  const team = (app.snapshot.team ?? []).filter(member => !member.disabledAt);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    void store.service.call<IntegrationTokenSummary[]>('admin/integrations').then(list => { if (active) setItems(list); }).catch(cause => { if (active) setError(errorMessage(locale, cause)); });
    return () => { active = false; };
  }, [owner, store, locale, loadKey]);
  const create = async () => {
    if (!label.trim() || !subject) return;
    setBusy(true); setError('');
    try {
      const scopes: IntegrationScope[] = complete ? ['work.read', 'work.complete'] : ['work.read'];
      const result = await store.service.call<{ token: string; summary: IntegrationTokenSummary }>('admin/integrations', { label: label.trim(), subjectUserId: subject, scopes });
      setCreated({ token: result.token, label: result.summary.label }); setLabel(''); setLoadKey(k => k + 1); app.onSaved(t('connections.created'));
    } catch (cause) { setError(errorMessage(locale, cause)); } finally { setBusy(false); }
  };
  const revoke = async (item: IntegrationTokenSummary) => {
    if (!await confirm({ title: t('connections.revoke'), message: t('connections.revokeConfirm', { label: item.label }) })) return;
    setBusy(true); setError('');
    try { await store.service.call('admin/integrations/' + encodeURIComponent(item.id) + '/revoke', {}); setLoadKey(k => k + 1); app.onSaved(t('connections.revoked')); }
    catch (cause) { setError(errorMessage(locale, cause)); } finally { setBusy(false); }
  };
  if (!owner) return null;
  return <section className="card team-settings team-figma" data-save-phase={busy ? 'saving' : 'editing'}>
    <header className="team-section-heading"><div><p className="team-eyebrow">{t('connections.eyebrow')}</p><h2>{t('connections.title')}</h2></div><Link2 size={18} aria-hidden="true" /></header>
    <p className="team-description">{t('connections.intro')}</p>
    {created && <div className="team-key-status connections-token" role="status"><div><strong>{t('connections.tokenOnce', { label: created.label })}</strong><p>{t('connections.tokenHint')}</p><code className="connections-token-value">{created.token}</code><div className="live-actions"><button type="button" onClick={() => { void navigator.clipboard?.writeText(created.token); app.onSaved(t('connections.copied')); }}><Copy size={15} aria-hidden="true" />{t('connections.copy')}</button><button type="button" onClick={() => setCreated(null)}>{t('connections.dismiss')}</button></div></div></div>}
    {items === null && !error && <p role="status">{t('connections.loading')}</p>}
    {items && !items.length && <p className="empty-state">{t('connections.none')}</p>}
    <ul className="live-records team-member-list">{(items ?? []).map(item => <li key={item.id} className={item.revokedAt ? 'is-revoked' : ''}>
      <div className="team-member-heading"><div><strong>{item.label}</strong><p>{t('connections.subject', { name: item.subjectName })} · {item.scopes.includes('work.complete') ? t('connections.scope.readComplete') : t('connections.scope.read')}</p><p className="muted">{t('connections.createdAt', { time: formatDateTime(locale, item.createdAt) })} · {item.lastUsedAt ? t('connections.lastUsed', { time: formatDateTime(locale, item.lastUsedAt) }) : t('connections.neverUsed')}{item.revokedAt ? ' · ' + t('connections.revokedAt', { time: formatDateTime(locale, item.revokedAt) }) : ''}</p></div></div>
      {!item.revokedAt && <div className="live-actions"><button type="button" disabled={busy} onClick={() => void revoke(item)}><ShieldOff size={15} aria-hidden="true" />{t('connections.revoke')}</button></div>}
    </li>)}</ul>
    <form data-form-dirty={Boolean(label)} onSubmit={event => { event.preventDefault(); void create(); }}>
      <div className="team-form-heading"><Plus size={19} aria-hidden="true" /><h3>{t('connections.create')}</h3></div>
      <div className="team-form-grid">
        <label>{t('connections.label')}<input disabled={busy} required maxLength={80} value={label} onChange={event => setLabel(event.target.value)} placeholder={t('connections.labelPlaceholder')} /></label>
        <label>{t('connections.subjectLabel')}<select disabled={busy} value={subject} onChange={event => setSubject(event.target.value)}>{team.map(member => <option key={member.id} value={member.id}>{member.name} · {t('team.role.' + member.role)}</option>)}</select></label>
      </div>
      <label className="connections-scope"><input type="checkbox" checked={complete} onChange={event => setComplete(event.target.checked)} />{t('connections.allowComplete')}</label>
      <p className="team-form-help">{t('connections.scopeHint')}</p>
      <div className="live-actions"><button type="submit" className="primary" disabled={busy || !label.trim() || !subject}>{t('connections.createButton')}</button></div>
    </form>
    {error && <p className="team-error" role="alert">{error}</p>}
    {dialog}
  </section>;
}

import { useState } from 'react';
import { KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { ROLES, ROLE_CAPS, type Role } from '@pirata/contracts/permissions';
import type { ModuleProps } from '../../services/moduleProps';
import { teamRequest } from '../../services/teamApi';
import { useT, LOCALE_NAMES, type Locale } from '../../i18n';
import './styles.css';
export { AISettingsView } from './aiSettings';
export { TranslationSettingsView } from './translationSettings';
export { ConnectionsView } from './connections';

/** Team accounts (owner): four roles with caps, passwords, access, language per member (R-ROLE-1). */
export function TeamSettings(app: ModuleProps) {
  const t = useT();
  const [name, setName] = useState(''), [username, setUsername] = useState(''), [password, setPassword] = useState(''), [role, setRole] = useState<Role>('worker');
  const [selected, setSelected] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const members = app.snapshot.team ?? [], me = app.snapshot.currentUser?.id, primaryOwner = members.find(member => member.role === 'owner')?.id;
  const active = (r: Role) => members.filter(member => member.role === r && !member.disabledAt).length;
  async function request(path: string, body: Record<string, unknown>, message: string) {
    setBusy(true); setError('');
    try { await teamRequest(app, path, body); await app.refresh(); app.onSaved(message); return true; }
    catch (cause) { setError((cause as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function save() {
    const ok = await request(selected ? 'admin/team/' + selected : 'admin/team', selected ? { password } : { name, username, password, role }, t('team.saved'));
    if (ok) { setPassword(''); setName(''); setUsername(''); setSelected(''); }
  }
  return <section className="card team-settings team-figma" data-save-phase={busy ? 'saving' : 'editing'}>
    <header className="team-section-heading"><div><p className="team-eyebrow">{t('team.eyebrow')}</p><h2>{t('shell.view.team')}</h2></div><span className="team-counter">{members.filter(member => !member.disabledAt).length} {t('team.active')}</span></header>
    <p className="team-description">{ROLES.map(r => `${active(r)}/${ROLE_CAPS[r]} ${t('team.role.' + r + 's')}`).join(' · ')}</p>
    <ul className="live-records team-member-list">{members.map(member => { const protectedOwner = member.id === primaryOwner; return <li key={member.id}>
      <div className="team-member-heading"><span className={'team-member-avatar' + (member.role === 'owner' ? ' is-owner' : '')} aria-hidden="true">{member.name.slice(0, 1)}</span><div><strong>{member.name}{member.id === me ? ' · ' + t('work.mine') : ''}</strong><p>{member.username} · {t('team.role.' + member.role)} · {LOCALE_NAMES[(member.locale ?? 'en') as Locale]}{member.disabledAt ? ' · ' + t('team.disabled') : ''}</p></div>{member.role === 'owner' && <ShieldCheck size={18} className="team-owner-mark" aria-label={t('team.role.owner')} />}</div>
      {!protectedOwner && <div className="live-actions">
        <label className="team-role-select"><span className="sr-only">{t('team.roleLabel')}</span><select disabled={busy} value={member.role} onChange={e => void request('admin/team/' + member.id, { role: e.target.value }, t('team.roleSaved'))}>{ROLES.map(r => <option key={r} value={r}>{t('team.role.' + r)}</option>)}</select></label>
        <button disabled={busy} onClick={() => { setSelected(member.id); setPassword(''); }}><KeyRound size={15} aria-hidden="true" />{t('team.resetPassword')}</button>
        <button disabled={busy} onClick={() => void request('admin/team/' + member.id, { disabled: !member.disabledAt }, t('team.accessSaved'))}>{member.disabledAt ? t('team.enable') : t('team.disable')}</button></div>}
    </li>; })}</ul>
    <form data-form-dirty={Boolean(name || username || password)} onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="team-form-heading"><UserPlus size={19} aria-hidden="true" /><h3>{selected ? t('team.newPasswordFor', { name: members.find(member => member.id === selected)?.name ?? '' }) : t('team.add')}</h3></div>
      <p className="team-form-help">{t('team.help')}</p>
      {!selected && <div className="team-form-grid"><label>{t('team.name')}<input disabled={busy} required value={name} onChange={event => setName(event.target.value)} maxLength={100} /></label><label>{t('team.username')}<input disabled={busy} required autoCapitalize="none" autoComplete="off" spellCheck={false} pattern="[a-z0-9][a-z0-9._-]{1,39}" value={username} onChange={event => setUsername(event.target.value.toLowerCase())} /></label>
        <label>{t('team.roleLabel')}<select disabled={busy} value={role} onChange={event => setRole(event.target.value as Role)}>{ROLES.map(r => <option key={r} value={r} disabled={active(r) >= ROLE_CAPS[r]}>{t('team.role.' + r)} ({active(r)}/{ROLE_CAPS[r]})</option>)}</select></label></div>}
      <label>{t('team.password')}<input disabled={busy} required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
      <div className="live-actions"><button type="submit" className="primary" disabled={busy}>{busy ? t('team.saving') : selected ? t('team.savePassword') : t('team.create')}</button>{selected && <button type="button" disabled={busy} onClick={() => { setSelected(''); setPassword(''); }}>{t('team.cancelReset')}</button>}</div>
    </form>
    {error && <p className="team-error" role="alert">{error}</p>}
  </section>;
}

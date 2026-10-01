import { useState } from 'react';
import { Anchor, ArrowRight, LockKeyhole } from 'lucide-react';
import { useServer } from '../state/serverContext';
import { useT, useLocale, useLocaleOverride, LOCALE_NAMES } from '../i18n';
export function SignIn() {
 const {store,state}=useServer(),t=useT(),locale=useLocale(),{setOverride}=useLocaleOverride();
 const [password,setPassword]=useState(''),[username,setUsername]=useState('');
 return <main className="signin">
  <header className="signin-brand"><div className="brand-mark"><Anchor size={44} aria-hidden="true"/></div><h1>Morgan el Pirata</h1><p>{t('signin.tagline')}</p></header>
  <div className="language-toggle signin-language" role="group" aria-label={t('shell.account.language')}>{(['en','es'] as const).map(code=><button key={code} type="button" className={locale===code?'selected':''} aria-pressed={locale===code} onClick={()=>setOverride(code)}>{LOCALE_NAMES[code]}</button>)}</div>
  {state.status==='loading'?<p role="status">{state.error?t('signin.reconnecting'):t('signin.connecting')}</p>:<form onSubmit={e=>{e.preventDefault();void store.login(password,username).then(()=>setPassword('')).catch(()=>{});}}>
   <label htmlFor="username">{t('signin.username')}</label><input id="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={t('signin.usernamePlaceholder')} required value={username} onChange={e=>setUsername(e.target.value)} disabled={state.busy}/>
   <label htmlFor="owner-password">{t('signin.password')}</label><input id="owner-password" type="password" autoComplete="current-password" placeholder={t('signin.passwordPlaceholder')} required value={password} onChange={e=>setPassword(e.target.value)} disabled={state.busy}/>
   <button className="primary" disabled={state.busy} aria-label="Sign in">{state.busy?t('signin.busy'):t('signin.button')}<ArrowRight size={18} aria-hidden="true"/></button>
  </form>}
  {state.error&&state.status!=='loading'&&<p role="alert" className="inline-warning">{state.error}</p>}
  <details className="signin-help"><summary>{t('signin.forgot')}</summary><p>{t('signin.forgotHelp')}</p></details>
  <p className="signin-private"><LockKeyhole size={14} aria-hidden="true"/>{t('signin.private')}</p><a href="/?demo=1">{t('signin.demo')}</a>
 </main>;
}

import { useState } from 'react';
import { Anchor, ArrowRight, LockKeyhole } from 'lucide-react';
import { useServer } from '../state/serverContext';
export function SignIn() {
 const {store,state}=useServer();
 const [password,setPassword]=useState(''),[username,setUsername]=useState('');
 return <main className="signin">
  <header className="signin-brand"><div className="brand-mark"><Anchor size={44} aria-hidden="true"/></div><h1>Morgan el Pirata</h1><p>Private team operations</p></header>
  {state.status==='loading'?<p role="status">Connecting to your workspace…</p>:<form onSubmit={e=>{e.preventDefault();void store.login(password,username).then(()=>setPassword('')).catch(()=>{});}}>
   <label htmlFor="username">Username</label><input id="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Your username" required value={username} onChange={e=>setUsername(e.target.value)} disabled={state.busy}/>
   <label htmlFor="owner-password">Pirata password</label><input id="owner-password" type="password" autoComplete="current-password" placeholder="Your password" required value={password} onChange={e=>setPassword(e.target.value)} disabled={state.busy}/>
   <button className="primary" disabled={state.busy} aria-label="Sign in">{state.busy?'Signing in…':'Sign in to workspace'}<ArrowRight size={18} aria-hidden="true"/></button>
  </form>}
  {state.error&&<p role="alert" className="inline-warning">{state.error}</p>}
  <details className="signin-help"><summary>Forgot password?</summary><p>Ask Andres to reset your password in Team accounts. If you’re the owner, use the private server recovery steps in the deployment guide.</p></details>
  <p className="signin-private"><LockKeyhole size={14} aria-hidden="true"/>Only your authorized team can access this workspace.</p><a href="/?demo=1">Explore the sample workspace</a>
 </main>;
}

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ServerContext } from './serverContext';
import type { ServerStore } from './serverStore';
export function ServerProvider({store,children}:{store:ServerStore;children:ReactNode}){
 const state=useSyncExternalStore(store.subscribe,store.getSnapshot),[clock,setClock]=useState(()=>performance.now());
 useEffect(()=>{const tick=()=>setClock(performance.now());const refresh=()=>{tick();if(document.visibilityState==='visible')void store.refresh().catch(()=>{});};const timer=window.setInterval(tick,1000);const poll=window.setInterval(()=>{if(document.visibilityState==='visible'&&store.getSnapshot().status==='ready')void store.refresh().catch(()=>{});},5000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);window.addEventListener('pageshow',refresh);return()=>{clearInterval(timer);clearInterval(poll);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('online',refresh);window.removeEventListener('pageshow',refresh);};},[store]);
 return <ServerContext value={{store,state,now:state.data?state.data.serverNow+Math.max(0,clock-state.receivedAt):0}}>{children}</ServerContext>;
}

import type { BusinessSnapshot, MutationResult, SessionStatus } from '@pirata/contracts/index';
import { ServiceError, type PirataService } from '../services/api';
export interface ServerState {data:BusinessSnapshot|null;status:'loading'|'ready'|'signed-out'|'reauth'|'error';error:string;busy:boolean;clockOffset:number;receivedAt:number}
/** Server-authoritative state only. Drafts stay in their forms; no browser storage. */
export function createServerStore(api:PirataService,clock=Date.now){
  let state:ServerState={data:null,status:'loading',error:'',busy:false,clockOffset:0,receivedAt:performance.now()};
  const listeners=new Set<()=>void>();let generation=0,minimumRevision=0,boot:Promise<void>|null=null,refreshing:Promise<void>|null=null;
  const publish=(patch:Partial<ServerState>)=>{state={...state,...patch};listeners.forEach(f=>f());};
  const failure=(error:unknown)=>{if(error instanceof ServiceError&&error.status===401)publish({status:state.data?'reauth':'signed-out',error:'Sign in again to continue. Your open draft is retained.'});else publish({error:error instanceof Error?error.message:'Could not connect to the server.'});};
  const observed=<T>(f:()=>Promise<T>)=>async()=>{try{return await f();}catch(e){failure(e);throw e;}};
  const acknowledge=(r:MutationResult)=>{minimumRevision=Math.max(minimumRevision,r.revision);return r;};
  const service:PirataService={
    session:async()=>{const s=await api.session();if(!s.authenticated)publish({status:state.data?'reauth':'signed-out'});return s;},
    login:api.login.bind(api),logout:api.logout.bind(api),snapshot:api.snapshot.bind(api),exportData:observed(()=>api.exportData()),
    execute:async(request)=>{const epoch=generation;const result=await observed(()=>api.execute(request))();if(epoch!==generation)throw new Error('Session changed. Sign in and reload.');return acknowledge(result);},
    previewImport:input=>observed(()=>api.previewImport(input))(),importData:async input=>acknowledge(await observed(()=>api.importData(input))()),
    call:(path,body)=>observed(()=>api.call(path,body))() as never,
  };
  async function load(epoch:number){
    const started=clock();const data=await api.snapshot();
    if(epoch!==generation)return;
    if(data.revision<minimumRevision)throw new Error('Waiting for the latest saved revision. Retry refresh.');
    if(data.revision<(state.data?.revision??0))return;
    publish({data,status:'ready',error:'',clockOffset:data.serverNow-(started+clock())/2,receivedAt:performance.now()});
  }
  function refresh():Promise<void>{
    if(refreshing)return refreshing;
    const epoch=generation;
    refreshing=(async()=>{try{const s=await api.session();if(epoch!==generation)return;if(!s.authenticated){publish({status:state.data?'reauth':'signed-out'});throw new ServiceError(401,{code:'UNAUTHENTICATED',message:'Sign in again to continue.'});}await load(epoch);}catch(e){if(epoch===generation)failure(e);throw e;}finally{if(epoch===generation)refreshing=null;}})();
    return refreshing;
  }
  async function login(password:string,username?:string){
    if(state.busy)return;const epoch=++generation;refreshing=null;publish({busy:true,error:''});
    try{await api.session();const s:SessionStatus=await api.login(password,username);if(!s.authenticated)throw new Error('Unable to sign in.');await load(epoch);}catch(e){failure(e);if(!state.data)publish({status:'signed-out'});throw e;}finally{publish({busy:false});}
  }
  async function logout(){
    if(state.busy)return;publish({busy:true,error:''});
    try{await api.logout();}catch(e){if(!(e instanceof ServiceError&&e.status===401)){failure(e);publish({busy:false});throw e;}}
    generation++;minimumRevision=0;refreshing=null;publish({data:null,status:'signed-out',error:'',busy:false,clockOffset:0,receivedAt:performance.now()});
  }
  return {service,getSnapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},refresh,login,logout,
    /** A cold start without network (phone waking up) keeps trying instead of showing the sign-in form (R-X-3). */
    initialize(){if(!boot)boot=(async()=>{for(let attempt=0;;attempt++){try{await refresh();return;}catch(e){if(state.data)return;if(state.status==='signed-out'){publish({error:''});return;}const offline=e instanceof ServiceError&&e.status===0;if(!offline||attempt>=12){publish({status:'error'});return;}publish({status:'loading',error:'Reconnecting…'});await new Promise(resolve=>setTimeout(resolve,Math.min(5000,1000*(attempt+1))));}}})();return boot;},
  };
}
export type ServerStore=ReturnType<typeof createServerStore>;

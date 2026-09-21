import { importPreviewSchema, importResultSchema, type ImportInput, type ImportPreview, type ImportRequest } from '@pirata/contracts/import';
import { apiFailureSchema, mutationResultSchema, sessionStatusSchema, snapshotSchema, type BusinessCommand, type BusinessService, type MutationRequest, type MutationResult } from '@pirata/contracts/index';
export class ServiceError extends Error {readonly status:number;readonly code:string;readonly fields?:Record<string,string>;readonly currentRevision?:number;constructor(status:number,error:{code:string;message:string;fields?:Record<string,string>;currentRevision?:number}){super(error.message);this.status=status;this.code=error.code;this.fields=error.fields;this.currentRevision=error.currentRevision;}}
export interface PirataService extends BusinessService { previewImport(input:ImportInput):Promise<ImportPreview>; importData(input:ImportRequest):Promise<MutationResult> }
/** Same-origin only. Session and CSRF values live in memory, never browser storage. */
export function createBusinessService(fetcher:typeof fetch=fetch):PirataService {
  let csrf='';
  async function request(path:string,body?:unknown){
    let response:Response;
    try{response=await fetcher('/api/v1/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},...(body===undefined?{}:{body:JSON.stringify(body)})});}
    catch{throw new ServiceError(0,{code:'NETWORK_ERROR',message:'Connection lost. Keep your draft and retry the same request.'});}
    if(!response.ok){const parsed=apiFailureSchema.safeParse(await response.json().catch(()=>null));throw new ServiceError(response.status,parsed.success?parsed.data.error:{code:'UNAVAILABLE',message:'Unable to load or save. Keep your draft and try again.'});}
    if(response.status===204)return undefined;
    try{return await response.json();}catch{throw new ServiceError(0,{code:'NETWORK_ERROR',message:'Response was interrupted. Keep your draft and retry the same request.'});}
  }
  return {async previewImport(input){return importPreviewSchema.parse(await request('import/preview',input));},async importData(input){return importResultSchema.parse(await request('import',input));},async session(){const s=sessionStatusSchema.parse(await request('session'));csrf=s.csrfToken;return s;},async login(password,username){if(!csrf)await this.session();const s=sessionStatusSchema.parse(await request('login',{password,...(username?{username}:{})}));csrf=s.csrfToken;return s;},async logout(){await request('logout',{});csrf='';},async snapshot(){return snapshotSchema.parse(await request('snapshot'));},async execute(envelope){return mutationResultSchema.parse(await request('commands',envelope));},async exportData(){return snapshotSchema.parse(await request('export'));}};
}
/** Create once per user intent; retain unchanged after uncertain network/503 errors. */
export function createMutation(command:BusinessCommand,baseRevision:number,requestId=crypto.randomUUID()):MutationRequest {return structuredClone({command,baseRevision,requestId});}
/** One stable envelope; concurrent clicks share the in-flight promise. Never auto-rebase. */
export function createSubmission(service:BusinessService,envelope:MutationRequest){
  const frozen=structuredClone(envelope);let pending:Promise<MutationResult>|null=null;
  return {request:structuredClone(frozen),submit(){if(!pending)pending=service.execute(frozen).finally(()=>{pending=null;});return pending;}};
}
export function acceptedRevision(current:number,result:MutationResult):number {return Math.max(current,result.revision);}

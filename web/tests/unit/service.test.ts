import { describe,expect,it } from 'vitest';
import { acceptedRevision,createBusinessService,createMutation,createSubmission,ServiceError } from '../../src/services/api';
import type { BusinessService,MutationResult } from '@pirata/contracts/index';
const command={type:'client.create' as const,name:'Test',phone:'',email:'',note:''};
describe('server service boundary',()=>{
  it('retains exact request and prevents duplicate in-flight submissions across uncertain retries',async()=>{
    const envelope=createMutation(command,4);let attempts=0;const sent:unknown[]=[];
    const service={execute:async(request:unknown)=>{sent.push(structuredClone(request));attempts++;if(attempts===1)throw new ServiceError(0,{code:'NETWORK_ERROR',message:'lost response'});return {requestId:envelope.requestId,revision:5,serverNow:100,changed:true,result:{kind:'client'}};}} as BusinessService;
    const submission=createSubmission(service,envelope);const first=submission.submit();expect(submission.submit()).toBe(first);await expect(first).rejects.toThrow('lost response');
    envelope.command={...command,name:'edited external object'};await expect(submission.submit()).resolves.toMatchObject({revision:5});expect(sent[0]).toEqual(sent[1]);expect(attempts).toBe(2);
  });
  it('an old idempotent replay cannot roll accepted revision backward',()=>{expect(acceptedRevision(8,{revision:4} as MutationResult)).toBe(8);});
  it('uses relative URLs, same-origin credentials and in-memory CSRF; preserves API errors',async()=>{
    const requests:{url:string;init:RequestInit}[]=[];const csrf='c'.repeat(43);
    const service=createBusinessService(async(input,init)=>{requests.push({url:String(input),init:init!});if(String(input).endsWith('session'))return new Response(JSON.stringify({authenticated:true,csrfToken:csrf,expiresAt:100000}));return new Response(JSON.stringify({error:{code:'REVISION_CONFLICT',message:'Refresh and review.',currentRevision:6}}),{status:409});});
    await service.session();await expect(service.execute(createMutation(command,4))).rejects.toMatchObject({code:'REVISION_CONFLICT',currentRevision:6,status:409});
    expect(requests[1].url).toBe('/api/v1/commands');expect(requests[1].init.credentials).toBe('same-origin');expect(requests[1].init.headers).toMatchObject({'X-CSRF-Token':csrf});
  });
  it('does not turn network failure into local success',async()=>{const service=createBusinessService(async()=>{throw new Error('offline');});await expect(service.execute(createMutation(command,0))).rejects.toMatchObject({code:'NETWORK_ERROR',status:0});});
  it('classifies a body-read failure after headers as an uncertain retry',async()=>{
    const service=createBusinessService(async()=>({ok:true,status:200,json:async()=>{throw new Error('truncated body');}} as unknown as Response));
    const submission=createSubmission(service,createMutation(command,0));
    await expect(submission.submit()).rejects.toMatchObject({code:'NETWORK_ERROR',status:0});
    await expect(submission.submit()).rejects.toMatchObject({code:'NETWORK_ERROR',status:0});
  });

});

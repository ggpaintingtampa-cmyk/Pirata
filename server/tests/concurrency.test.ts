import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { expect,it } from 'vitest';
import { createFixture } from './helpers/fixture.js';
it('two truly simultaneous worker-thread SQLite writers cannot lose an update',async()=>{
  const f=await createFixture();const workers:Worker[]=[];
  try{
    for(const name of ['one','two']){const w=new Worker(new URL('./helpers/concurrent-writer.ts',import.meta.url),{execArgv:['--import',import.meta.resolve('tsx')],workerData:{path:f.path,ownerId:f.ownerId,request:f.envelope({type:'client.create',name,phone:'',email:'',note:''})}});workers.push(w);await once(w,'message');}
    const completed=workers.map(w=>once(w,'message'));workers.forEach(w=>w.postMessage('start'));
    const results=await Promise.all(completed);expect(results.map(([r])=>r.status).sort()).toEqual([200,409]);expect(f.repo.list('clients')).toHaveLength(1);
  }finally{await Promise.all(workers.map(w=>w.terminate()));await f.close();}
});

import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../../src/db/database.js';
import { executeCommand } from '../../src/core/commands.js';
import { ApiError } from '../../src/core/errors.js';
const db=openDatabase(workerData.path);
parentPort!.postMessage('ready');
parentPort!.once('message',()=>{
  try{const result=executeCommand(db,workerData.ownerId,workerData.request,{'client.create':(ctx,c)=>{const id=ctx.newId();ctx.repo.insert('clients',{id,name:c.name,phone:c.phone,email:c.email,note:c.note,archivedAt:null,createdAt:ctx.serverNow,updatedAt:ctx.serverNow});return {changed:true,result:{kind:'client',id}};}});parentPort!.postMessage({status:200,revision:result.revision});}
  catch(error){parentPort!.postMessage({status:error instanceof ApiError?error.status:503});}
  finally{db.close();parentPort!.close();}
});

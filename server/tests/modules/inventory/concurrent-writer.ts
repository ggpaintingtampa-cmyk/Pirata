import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../../../src/db/database.js';
import { executeCommand } from '../../../src/core/commands.js';
import { handlers } from '../../../src/modules/inventory/index.js';
import { ApiError } from '../../../src/core/errors.js';
const db = openDatabase(workerData.path);
parentPort!.postMessage('ready');
parentPort!.once('message', () => {
  try { parentPort!.postMessage({ status: 200, result: executeCommand(db, workerData.ownerId, workerData.request, handlers) }); }
  catch (error) { parentPort!.postMessage({ status: error instanceof ApiError ? error.status : 500 }); }
  finally { db.close(); }
});

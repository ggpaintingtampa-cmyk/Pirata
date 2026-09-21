import { configuration } from './config.js';
import { openDatabase } from './db/database.js';
import { createApp } from './app.js';
process.umask(0o077);
const config=configuration();
const db=openDatabase(config.databasePath);
const app=createApp({db,origin:config.origin,audit:event=>process.stdout.write(JSON.stringify(event)+'\n')});
app.addHook('onClose',async()=>{db.close();});
try{await app.listen({host:'127.0.0.1',port:config.port});process.stdout.write('Pirata API listening on loopback.\n');}
catch{await app.close();process.stderr.write('API startup failed; check local configuration, database, and port.\n');process.exitCode=1;}
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close();});

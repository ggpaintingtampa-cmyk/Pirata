import { configuration } from './config.js';
import { openDatabase } from './db/database.js';
import { backup, restoreToScratch } from './db/backup.js';
import { setOwnerPassword } from './auth/password.js';
process.umask(0o077);
function concealed(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Use an interactive terminal. Password arguments and piped input are not supported.');
  }
  const input = process.stdin;
  const previousRaw = input.isRaw === true;
  return new Promise((resolve, reject) => {
    let value = '';
    let settled = false;
    const finish = (failure?: Error) => {
      if (settled) return;
      settled = true;
      const answer = value;
      value = '';
      input.off('data', read);
      input.off('error', failed);
      input.off('end', ended);
      input.off('close', ended);
      process.off('SIGINT', interrupted);
      process.off('SIGTERM', interrupted);
      process.off('SIGHUP', interrupted);
      try {
        input.setRawMode(previousRaw);
      } catch {
        failure = new Error('Could not restore terminal input mode.');
      }
      input.pause();
      process.stdout.write('\n');
      if (failure) reject(failure);
      else resolve(answer);
    };
    const read = (chunk: Buffer) => {
      for (const c of chunk.toString('utf8')) {
        if (c === '\u0003' || c === '\u0004') {
          finish(new Error('Cancelled.'));
          return;
        }
        if (c === '\r' || c === '\n') {
          finish();
          return;
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else if (c >= ' ' && value.length < 129) value += c;
      }
    };
    const failed = () => finish(new Error('Terminal input failed.'));
    const ended = () => finish(new Error('Terminal input ended.'));
    const interrupted = () => finish(new Error('Cancelled.'));
    try {
      // A prompt is permission to type: disable echo and install every handler
      // before exposing it, including the confirmation/recovery prompt.
      input.setRawMode(true);
      input.on('data', read);
      input.once('error', failed);
      input.once('end', ended);
      input.once('close', ended);
      process.once('SIGINT', interrupted);
      process.once('SIGTERM', interrupted);
      process.once('SIGHUP', interrupted);
      input.resume();
      process.stdout.write(prompt);
    } catch {
      finish(new Error('Could not prepare concealed terminal input.'));
    }
  });
}
try{
  const [action,...args]=process.argv.slice(2);
  if(!['migrate','setup','recover','backup','restore'].includes(action??''))throw new Error('Usage: migrate | setup | recover | backup NEW_PATH | restore BACKUP NEW_SCRATCH_PATH');
  const expected=action==='restore'?2:action==='backup'?1:0;
  if(args.length!==expected)throw new Error('Unexpected arguments. Never pass credentials as arguments.');
  if(action==='restore'){await restoreToScratch(args[0],args[1]);}
  else{
    const db=openDatabase(configuration().databasePath,{create:action==='migrate'});
    try{if(action==='setup'||action==='recover'){const password=await concealed('New owner password (hidden): ');const confirm=await concealed('Repeat password (hidden): ');if(password!==confirm)throw new Error('Passwords do not match.');await setOwnerPassword(db,password,action);}
    if(action==='backup')await backup(db,args[0]);}finally{db.close();}
  }
  process.stdout.write('Completed.\n');
}catch(error){process.stderr.write(error instanceof Error&& !('code' in error)?error.message+'\n':'Operation failed; inspect local paths and database integrity.\n');process.exitCode=1;}

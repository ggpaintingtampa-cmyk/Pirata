import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
export function configuration(env:NodeJS.ProcessEnv=process.env){
  const root=fileURLToPath(new URL('../',import.meta.url));
  const databasePath=resolve(env.PIRATA_DB_PATH??resolve(root,'var/pirata.sqlite'));
  const web=resolve(root,'../web');
  if(databasePath===web||databasePath.startsWith(web+sep))throw new Error('Database must remain outside the web directory.');
  const port=Number(env.PIRATA_PORT??3001);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PIRATA_PORT must be an explicit unprivileged port.');
  const origin=env.PIRATA_ORIGIN??'https://localhost:5173';
  if(new URL(origin).origin!==origin||new URL(origin).protocol!=='https:')throw new Error('PIRATA_ORIGIN must be an HTTPS origin for Secure cookies.');
  return {databasePath,port,origin};
}

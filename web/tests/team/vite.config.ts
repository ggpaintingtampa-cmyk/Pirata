import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export default defineConfig({plugins:[react()],server:{watch:{ignored:['**/artifacts/**','**/results/**','**/test-results/**','**/playwright-report/**']},...(process.env.PIRATA_TEST_WEBKIT?{https:{cert:readFileSync(fileURLToPath(new URL('../../../backups/testing-runtime/localhost-cert.pem',import.meta.url))),key:readFileSync(fileURLToPath(new URL('../../../backups/testing-runtime/localhost-key.pem',import.meta.url)))}}:{}),host:'127.0.0.1',port:5191,strictPort:true,proxy:{'/api':'http://127.0.0.1:3007'}}});

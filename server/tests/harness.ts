// Test-only process. No production DB configuration is read and no fixtures ship in start.
import { createFixture } from './helpers/fixture.js';
const fixture=await createFixture({origin:'http://127.0.0.1:5174'});
const {setOwnerPassword}=await import('../src/auth/password.js');
await setOwnerPassword(fixture.db,'isolated-harness-password','recover');
await fixture.app.listen({host:'127.0.0.1',port:3002});
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{void fixture.close();});

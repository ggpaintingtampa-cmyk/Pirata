// Isolated test database only. Never reads production configuration.
import {createFixture} from './helpers/fixture.js';
import {setOwnerPassword} from '../src/auth/password.js';
const f=await createFixture({origin:(process.env.PIRATA_TEST_WEBKIT?'https':'http')+'://127.0.0.1:5191'});
await setOwnerPassword(f.db,'isolated-team-browser-password','recover');
await f.app.listen({host:'127.0.0.1',port:3007});
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{void f.close();});

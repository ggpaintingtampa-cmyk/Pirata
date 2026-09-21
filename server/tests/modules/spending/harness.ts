// Group B only: always a disposable fixture; never read a live DB environment path.
import { createFixture } from '../../helpers/fixture.js';
import { setOwnerPassword } from '../../../src/auth/password.js';
const fixture = await createFixture({ origin: 'http://127.0.0.1:5183' });
await setOwnerPassword(fixture.db, 'isolated-group-b-password', 'recover');
await fixture.app.listen({ host: '127.0.0.1', port: 3004 });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void fixture.close(); });

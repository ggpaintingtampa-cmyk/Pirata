// Group A only: disposable fixture, no production environment paths.
import { createFixture } from '../../helpers/fixture.js';
import { setOwnerPassword } from '../../../src/auth/password.js';
const fixture = await createFixture({ origin: (process.env.PIRATA_TEST_HTTPS==='1'?'https':'http')+'://127.0.0.1:5182' });
await setOwnerPassword(fixture.db, 'group-a-fixture-password', 'recover');
await fixture.app.listen({ host: '127.0.0.1', port: Number(process.env.PIRATA_GROUP_A_API_PORT || 3003) });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void fixture.close(); });

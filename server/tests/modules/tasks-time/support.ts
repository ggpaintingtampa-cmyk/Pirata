import { expect } from 'vitest';
import type { BusinessCommand, BusinessSnapshot, MutationRequest, MutationResult } from '@pirata/contracts/index';
import { createFixture } from '../../helpers/fixture.js';
export const NOW = Date.parse('2026-09-18T03:59:30Z');
export async function setup() {
  let now = NOW;
  const f = await createFixture({ now: () => now });
  const auth = await f.authenticate();
  const snapshot = async (): Promise<BusinessSnapshot> => (await f.app.inject({ url: '/api/v1/snapshot', headers: auth })).json();
  const post = (envelope: MutationRequest, headers: Record<string, string> = auth) => f.app.inject({ method: 'POST', url: '/api/v1/commands', headers, payload: envelope });
  async function send(command: BusinessCommand) { return post(f.envelope(command, (await snapshot()).revision)); }
  async function save(command: BusinessCommand) { const r = await send(command); expect(r.statusCode, r.body).toBe(200); return r.json<MutationResult>(); }
  async function task(title = 'Prepare') { return (await save({ type: 'task.create', title, projectId: null, estimatedMinutes: 60, note: '' })).result.id!; }
  return { ...f, auth, snapshot, post, send, save, task, clock: (value: number) => { now = value; } };
}
export type TestApp = Awaited<ReturnType<typeof setup>>;

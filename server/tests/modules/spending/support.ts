import { expect } from 'vitest';
import type { BusinessCommand, BusinessSnapshot, MutationRequest, MutationResult } from '@pirata/contracts/index';
import { createFixture } from '../../helpers/fixture.js';
export const NOW = Date.parse('2026-09-17T14:00:00Z');
export const DATE = '2026-09-17';
export async function moduleFixture() {
  let clock = NOW;
  const f = await createFixture({ now: () => clock }), auth = await f.authenticate();
  let revision = 0;
  const request = (payload: MutationRequest) => f.app.inject({ method: 'POST', url: '/api/v1/commands', headers: auth, payload });
  async function send(command: BusinessCommand) {
    const envelope = f.envelope(command, revision), response = await request(envelope);
    if (response.statusCode === 200) revision = response.json<MutationResult>().revision;
    return { response, envelope };
  }
  async function save(command: BusinessCommand) {
    const { response } = await send(command); expect(response.statusCode, response.body).toBe(200);
    return response.json<MutationResult>();
  }
  async function snapshot(): Promise<BusinessSnapshot> { return (await f.app.inject({ url: '/api/v1/snapshot', headers: auth })).json(); }
  return { ...f, auth, send, save, snapshot, request, tick: (milliseconds = 1000) => { clock += milliseconds; }, revision: () => revision };
}
export type ModuleFixture = Awaited<ReturnType<typeof moduleFixture>>;
export const project = (name = 'Exterior') => ({ type: 'project.create' as const, name, clientId: null, clientName: '', address: '', note: '' });
export const purchase = (amountCents = 2500, projectId: string | null = null) => ({ type: 'expense.create' as const, description: '  Paint  ', purchaseDate: DATE, category: 'materials' as const, amountCents, projectId });
export const material = (stockMinor = 200, unit: 'gal' | 'piece' = 'gal') => ({ type: 'material.create' as const, name: 'Paint', product: 'Exterior', color: 'White', finish: 'Satin', unit, stockMinor });

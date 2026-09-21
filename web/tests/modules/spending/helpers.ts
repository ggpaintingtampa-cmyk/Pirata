import { devices, expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import type { BusinessCommand, BusinessSnapshot, MutationResult } from '@pirata/contracts/index';
export const test = base.extend<object, { moduleContext: BrowserContext }>({
  moduleContext: [async ({ browser }, provide) => {
    const context = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York', baseURL: 'http://127.0.0.1:5183' });
    await provide(context); await context.close();
  }, { scope: 'worker' }],
  page: async ({ moduleContext }, provide) => { const page = await moduleContext.newPage(); await provide(page); await page.close(); },
});
export { expect };
export async function openModule(page: Page, view = 'ExpensesView', selection: Record<string, string> = {}) {
  const sessionResponse = page.waitForResponse(r => r.url().endsWith('/api/v1/session'));
  await page.goto('/tests/modules/spending/harness.html?' + new URLSearchParams({ view, ...selection }));
  if (!(await (await sessionResponse).json()).authenticated) {
    await page.getByLabel('Fixture password').fill('isolated-group-b-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await expect(page.getByTestId('module-view')).toBeAttached();
  await expect(view.endsWith('Detail') || view === 'ExpenseForm' ? page.getByRole('dialog') : page.getByTestId('module-view')).toBeVisible();
}
export async function snapshot(page: Page): Promise<BusinessSnapshot> { return page.evaluate(async () => { const r = await fetch('/api/v1/snapshot'); if (!r.ok) throw new Error('Snapshot ' + r.status); return r.json(); }); }
export async function command(page: Page, command: BusinessCommand): Promise<MutationResult> {
  return page.evaluate(async command => {
    const session = await (await fetch('/api/v1/session')).json(), current = await (await fetch('/api/v1/snapshot')).json();
    const r = await fetch('/api/v1/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ requestId: crypto.randomUUID(), baseRevision: current.revision, command }) });
    if (!r.ok) throw new Error('Command ' + r.status + ': ' + await r.text()); return r.json();
  }, command);
}
export async function save(page: Page, label = 'Save') { await page.getByRole('button', { name: label, exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); }
export async function rotateSession(page: Page) {
  await page.evaluate(async () => {
    const s = await (await fetch('/api/v1/session')).json();
    const r = await fetch('/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrfToken }, body: JSON.stringify({ password: 'isolated-group-b-password' }) });
    if (!r.ok) throw new Error('Login rotation ' + r.status);
  });
}
export const projectInput = (name: string) => ({ type: 'project.create' as const, name, clientId: null, clientName: '', address: '', note: '' });
export const materialInput = (name: string, stockMinor = 200) => ({ type: 'material.create' as const, name, stockMinor, product: '', color: '', finish: '', unit: 'gal' as const });

import { devices, expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import type { BusinessCommand, BusinessSnapshot, MutationResult } from '@pirata/contracts/index';
export const TEST_URL=(process.env.PIRATA_TEST_HTTPS==='1'?'https':'http')+'://127.0.0.1:5182';
export const test = base.extend<object, { groupContext: BrowserContext }>({
  groupContext: [async ({ browser, browserName }, provide) => { const ctx = await browser.newContext({ ...devices[browserName==='webkit'?'iPhone 13':'Pixel 7'], viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York', baseURL: TEST_URL,ignoreHTTPSErrors:process.env.PIRATA_TEST_HTTPS==='1' }); await provide(ctx); await ctx.close(); }, { scope: 'worker' }],
  page: async ({ groupContext }, provide) => { const page = await groupContext.newPage(); await provide(page); await page.close(); },
});
export { expect };
export async function open(page: Page, view = 'TaskList', selection: Record<string, string> = {}) {
  const session = page.waitForResponse(r => r.url().endsWith('/api/v1/session'));
  await page.goto('/tests/modules/tasks-time/harness/?' + new URLSearchParams({ view, ...selection }));
  if (!(await (await session).json()).authenticated) { await page.getByLabel('Fixture password').fill('group-a-fixture-password'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); }
  await expect(page.getByTestId('module-view')).toBeAttached();
  if (view === 'TaskEditor' || view === 'ScheduleTaskDialog') await expect(page.getByRole('dialog')).toBeVisible();
  else await expect(page.getByTestId('module-view')).toBeVisible();
}
export async function snapshot(page: Page): Promise<BusinessSnapshot> { return page.evaluate(async () => { const r = await fetch('/api/v1/snapshot'); if (!r.ok) throw new Error('Snapshot failed'); return r.json(); }); }
export async function command(page: Page, command: BusinessCommand): Promise<MutationResult> {
  return page.evaluate(async command => {
    const s = await (await fetch('/api/v1/session')).json(), state = await (await fetch('/api/v1/snapshot')).json();
    const r = await fetch('/api/v1/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrfToken }, body: JSON.stringify({ requestId: crypto.randomUUID(), baseRevision: state.revision, command }) });
    if (!r.ok) throw new Error(await r.text()); return r.json();
  }, command);
}
export async function task(page: Page, title: string) { return (await command(page, { type: 'task.create', title, projectId: null, estimatedMinutes: 60, note: '' })).result.id!; }
export async function stopTimer(page: Page) { const timer = (await snapshot(page)).runningTimer; if (timer) await command(page, { type: 'timer.discard', expectedSessionId: timer.sessionId }); }

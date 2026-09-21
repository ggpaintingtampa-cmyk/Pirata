import type { MutationRequest } from '@pirata/contracts/index';
import { businessDate } from '@pirata/domain/lib/dates';
import { filteredExpenses, latestExpenses, totalCents } from '../../../src/features/spending/selectors';
import { test, expect, openModule, snapshot, command, save, rotateSession, projectInput } from './helpers';

test('phone purchase add/edit/refresh and date/project filters', async ({ page }) => {
  await openModule(page); const p = (await command(page, projectInput('Spending exterior'))).result.id!;
  await openModule(page, 'ExpenseForm', { projectId: p });
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue(p);
  await page.getByLabel('Description', { exact: true }).fill('Phone paint'); await page.getByLabel('Amount ($)', { exact: true }).fill('25.00'); await save(page);
  let s = await snapshot(page); const e = s.expenses.find(e => e.description === 'Phone paint')!; const count = s.expenses.length;
  expect(e.amountCents).toBe(2500);
  await openModule(page, 'ExpenseForm', { expenseId: e.id });
  await page.getByLabel('Amount ($)', { exact: true }).fill('30.00'); await page.getByLabel('Purchase date', { exact: true }).fill('2026-09-18'); await page.getByLabel('Project', { exact: true }).selectOption(''); await save(page);
  s = await snapshot(page); expect(s.expenses).toHaveLength(count); expect(s.expenses.find(x => x.id === e.id)).toMatchObject({ amountCents: 3000, createdAt: e.createdAt, projectId: null });
  await openModule(page); await page.getByLabel('Purchase date filter').fill('2026-09-18'); await page.getByLabel('Project filter').selectOption('');
  await expect(page.getByRole('heading', { name: 'Phone paint' })).toBeVisible(); await expect(page.locator('.sp-total strong')).toHaveText('$30.00');
  await page.getByLabel('Project filter').selectOption(p); await expect(page.getByText('No purchases match these filters.')).toBeVisible();
  await openModule(page, 'ExpensesView', { projectId: p }); await page.getByLabel('Project filter').selectOption(''); await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue(''); await page.keyboard.press('Escape');
});
test('decimal totals and deterministic latest-three ordering survive edits', async ({ page }) => {
  await openModule(page); const s = await snapshot(page), date = businessDate(s.serverNow), base = { createdAt: 10, updatedAt: 100, projectId: null, purchaseDate: date, category: 'other' as const };
  const fixture = { ...s, expenses: [{ ...base, id: 'b', description: 'B', amountCents: 10 }, { ...base, id: 'a', description: 'A', amountCents: 20 }, { ...base, id: 'c', description: 'C', amountCents: 1 }, { ...base, id: 'd', description: 'D', amountCents: 1 }] };
  expect(totalCents(fixture.expenses.slice(0, 2))).toBe(30); expect(latestExpenses(fixture, date).map(e => e.id)).toEqual(['a', 'b', 'c']);
  fixture.expenses[3].updatedAt = 1000; expect(latestExpenses(fixture, date).map(e => e.id)).toEqual(['a', 'b', 'c']);
  expect(filteredExpenses(fixture, date, 'some-project')).toEqual([]);
});
test('invalid amount focuses its field, retains text and dirty Cancel saves nothing', async ({ page }) => {
  await openModule(page); const count = (await snapshot(page)).expenses.length;
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill('Invalid retained draft'); await page.getByLabel('Amount ($)', { exact: true }).fill('1e3');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByLabel('Amount ($)', { exact: true })).toBeFocused(); await expect(page.getByLabel('Amount ($)', { exact: true })).toHaveValue('1e3');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Discard unsaved changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click(); await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Invalid retained draft');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByRole('button', { name: 'Add purchase', exact: true })).toBeFocused(); expect((await snapshot(page)).expenses).toHaveLength(count);
});
test('lost save response plus real CSRF rotation retries original envelope without duplicates', async ({ page }) => {
  await openModule(page); const before = (await snapshot(page)).expenses.length; const requests: MutationRequest[] = [];
  page.on('request', r => { if (r.url().endsWith('/api/v1/commands')) requests.push(r.postDataJSON()); });
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click(); await page.getByLabel('Description', { exact: true }).fill('Interrupted purchase'); await page.getByLabel('Amount ($)', { exact: true }).fill('10.20');
  await page.route('**/api/v1/commands', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Retry same save' })).toBeVisible();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await rotateSession(page); await page.getByRole('button', { name: 'Retry same save' }).click(); await expect(page.getByRole('alert')).toContainText('sign-in');
  await save(page, 'Retry same save');
  expect((await snapshot(page)).expenses).toHaveLength(before + 1); expect(requests).toHaveLength(3); expect(requests[1]).toEqual(requests[0]); expect(requests[2]).toEqual(requests[0]);
});
test('signed-out save retains request while owner signs back in', async ({ page }) => {
  await openModule(page); await page.getByRole('button', { name: 'Add purchase', exact: true }).click(); await page.getByLabel('Description', { exact: true }).fill('Reauthenticated purchase'); await page.getByLabel('Amount ($)', { exact: true }).fill('1');
  const requests: MutationRequest[] = []; page.on('request', r => { if (r.url().endsWith('/api/v1/commands')) requests.push(r.postDataJSON()); });
  await page.evaluate(async () => { const s = await (await fetch('/api/v1/session')).json(); await fetch('/api/v1/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrfToken }, body: '{}' }); });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Retry same save' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry same save' }).click(); await expect(page.getByRole('alert')).toContainText('Sign in in another tab');
  await rotateSession(page); await save(page, 'Retry same save'); expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
});
test('snapshot refresh preserves a draft and its original revision until explicit conflict review', async ({ page }) => {
  await openModule(page); await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill('Conflict draft'); await page.getByLabel('Amount ($)', { exact: true }).fill('3.50');
  await command(page, projectInput('Concurrent spending project'));
  const refreshed = page.waitForResponse(r => r.url().endsWith('/api/v1/snapshot')); await page.getByTestId('refresh').evaluate(button => (button as HTMLButtonElement).click()); await refreshed;
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Conflict draft');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Load latest records' })).toBeVisible();
  await page.getByRole('button', { name: 'Load latest records' }).click(); await expect(page.getByLabel('Description', { exact: true })).toBeEnabled(); await save(page);
  expect((await snapshot(page)).expenses.filter(e => e.description === 'Conflict draft')).toHaveLength(1);
});
test('acknowledged save with failed refresh retries only the refresh', async ({ page }) => {
  await openModule(page); await page.getByRole('button', { name: 'Add purchase', exact: true }).click(); await page.getByLabel('Description', { exact: true }).fill('Refresh-only purchase'); await page.getByLabel('Amount ($)', { exact: true }).fill('4');
  let writes = 0; page.on('request', r => { if (r.url().endsWith('/api/v1/commands')) writes++; });
  await page.route('**/api/v1/snapshot', route => route.abort('failed'), { times: 1 });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Reload saved record' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(1); await save(page, 'Reload saved record'); expect(writes).toBe(1);
});
test('in-flight request cannot be dismissed or submitted twice', async ({ page }) => {
  await openModule(page); let release = () => {}; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/commands', async route => { const response = await route.fetch(); await held; await route.fulfill({ response }); }, { times: 1 });
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click(); await page.getByLabel('Description', { exact: true }).fill('In-flight purchase'); await page.getByLabel('Amount ($)', { exact: true }).fill('5'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled(); await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled(); release(); await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('spending fits narrow/phone/tablet/desktop and has native keyboard dialogs', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const [width, height] of [[320, 760], [390, 844], [768, 1024], [1280, 900]]) {
    await page.setViewportSize({ width, height }); await openModule(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const add = page.getByRole('button', { name: 'Add purchase', exact: true }); expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (width === 390 || width === 1280) await page.screenshot({ path: `tests/modules/spending/artifacts/spending-${width}.png`, fullPage: true });
    await add.click(); await expect(page.getByLabel('Description', { exact: true })).toBeFocused();
    const box = (await page.getByRole('dialog').boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.height).toBeLessThanOrEqual(height);
    await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused(); await page.keyboard.press('Escape'); await expect(add).toBeFocused();
  }
  expect(errors).toEqual([]);
});

import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { key, openDemo, quick, saved, section } from './helpers';
test('reset replaces only the application key after confirmation', async ({ page }) => {
  await openDemo(page);
  await page.evaluate(() => localStorage.setItem('unrelated-app:keep', 'untouched'));
  await page.getByRole('button', { name: 'Start timer' }).click();
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
  expect((await saved(page)).runningTimer).not.toBeNull();
  await page.getByRole('button', { name: 'Confirm reset', exact: true }).click();
  expect((await saved(page)).runningTimer).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-app:keep'))).toBe('untouched');
  await expect(section(page, 'Spent today')).toContainText('$84.60');
});
test('corrupt storage is preserved and can be downloaded without overwriting', async ({ page }) => {
  await openDemo(page);
  await page.evaluate(storageKey => localStorage.setItem(storageKey, '{broken original data'), key);
  await page.reload();
  await expect(page.getByText('Your stored data needs recovery')).toBeVisible();
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key)).toBe('{broken original data');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download stored content' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('morgan-el-pirata-stored-data.txt');
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key)).toBe('{broken original data');
});
test('failed save preserves the form and saved total', async ({ page }) => {
  await openDemo(page);
  await quick(page, 'Expense');
  await page.getByLabel('Description', { exact: true }).fill('Storage failure test');
  await page.getByLabel('Amount ($)', { exact: true }).fill('25');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Could not save');
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Storage failure test');
  expect((await saved(page)).expenses).toHaveLength(2);
  await expect(page.getByText('Expense added.', { exact: true })).toHaveCount(0);
});
test('unavailable storage requires explicit memory demo and keeps a visible warning', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  await page.goto('/?demo=1');
  await expect(page.getByText('Saving is unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use in-memory demo' }).click();
  await expect(page.getByText('Memory-only demo — changes will be lost on reload.')).toBeVisible();
  await page.getByRole('button', { name: 'Start timer' }).click();
  await expect(section(page, 'Current task')).toContainText('Session running');
  await expect(page.getByText('Memory-only demo — changes will be lost on reload.')).toBeVisible();
});
test('changes in another tab freeze editing until reload', async ({ page, context }) => {
  await openDemo(page);
  const other = await context.newPage();
  await other.goto('/?demo=1');
  await other.evaluate(storageKey => {
    const state = JSON.parse(localStorage.getItem(storageKey)!);
    state.expenses[0].amountCents = 1;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, key);
  await expect(page.getByText('This demo changed in another tab. Reload to continue.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reload to continue' }).click();
  await expect(section(page, 'Spent today')).toContainText('$22.21');
});
test('date rolls over on midnight without reseeding or moving records', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-17T03:59:55Z') });
  await page.goto('/?demo=1');
  await expect(section(page, 'Spent today')).toContainText('$84.60');
  await page.clock.fastForward(10000);
  await expect(page.getByText('Thursday, September 17', { exact: true })).toBeVisible();
  await expect(section(page, "Today's objectives")).toContainText('Choose up to three outcomes for today.');
  await expect(section(page, 'Spent today')).toContainText('$0.00');
  expect((await saved(page)).seededOn).toBe('2026-09-16');
  expect((await saved(page)).objectives).toHaveLength(3);
});
test('backward clock requires an explicit correction or confirmed discard', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Start timer' }).click();
  await page.clock.setSystemTime(new Date('2026-09-16T13:00:00Z'));
  await page.clock.runFor(1000);
  await page.getByRole('button', { name: 'Correct active timer' }).click();
  await page.getByRole('button', { name: 'Discard active session', exact: true }).click();
  expect((await saved(page)).runningTimer).not.toBeNull();
  await page.getByRole('button', { name: 'Confirm discard session' }).click();
  expect((await saved(page)).runningTimer).toBeNull();
  expect((await saved(page)).timeEntries).toHaveLength(1);
});

test('maintenance save failure stays visible inside its detail dialog', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'View Clean the sprayer' }).click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Could not save');
  expect((await saved(page)).maintenance[0].completedAt).toBeNull();
});

test('demo export downloads valid v1 records without changing browser storage', async ({ page }) => {
  await openDemo(page);
  const before = await saved(page);
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download demo export', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('pirata-browser-demo-v1.json');
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(before);
  expect(await saved(page)).toEqual(before);
});

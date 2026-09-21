import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const choices = ['Task', 'Expense', 'Time entry', 'Material adjustment', 'Lead'];
async function menu(page: Page) {
  await page.locator('.add-button').click();
  await page.getByRole('button', { name: 'Back to Add menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Quick Add', exact: true })).toBeVisible();
}
async function choice(page: Page, name: string) {
  await page.getByRole('dialog').getByRole('button', { name: new RegExp('^' + name) }).click();
  await expect(page.getByRole('button', { name: 'Back to Add menu', exact: true })).toBeVisible();
}
async function returned(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name: 'Quick Add', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: new RegExp('^' + name) })).toBeFocused();
}
async function revision(page: Page) {
  return page.evaluate(async () => (await (await fetch('/api/v1/snapshot')).json()).revision as number);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Username', {exact:true}).fill('owner');
  await page.getByLabel('Pirata password').fill('isolated-harness-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Work.', exact: true })).toBeVisible();
});
test('X, Back, Cancel and native dismiss return all five Add forms to their choices', async ({ page }) => {
  const before = await revision(page);
  await menu(page);
  for (const name of choices) {
    for (const action of ['Close dialog', 'Back to Add menu', 'Cancel', 'Escape']) {
      await choice(page, name);
      if (action === 'Escape') await page.keyboard.press('Escape');
      else await page.getByRole('dialog').getByRole('button', { name: action, exact: true }).click();
      await returned(page, name);
    }
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.add-button')).toBeFocused();
  expect(await revision(page)).toBe(before);
});
test('dirty task and expense drafts are retained or discarded before returning to Add', async ({ page }) => {
  const before = await revision(page);
  await menu(page);
  for (const [name, label] of [['Task', 'Task title'], ['Expense', 'Description']]) {
    await choice(page, name);
    await page.getByLabel(label, { exact: true }).fill('Unsaved navigation draft');
    await page.getByRole('button', { name: 'Back to Add menu', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Discard unsaved changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('Unsaved navigation draft');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await returned(page, name);
    await choice(page, name);
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await returned(page, name);
  }
  expect(await revision(page)).toBe(before);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.add-button')).toBeFocused();
});
test('Add navigation fits phone and desktop with reachable controls', async ({ page }) => {
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const [width, height] of [[320, 844], [390, 844], [768, 1024], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    await menu(page);
    await choice(page, 'Expense');
    const dialog = page.getByRole('dialog');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const name of ['Close dialog', 'Back to Add menu', 'Cancel']) {
      const button = dialog.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    await dialog.getByRole('button', { name: 'Back to Add menu', exact: true }).focus();
    if (width === 390 || width === 1280) {
      await page.screenshot({ path: `artifacts/screenshots/quick-add-${width === 390 ? 'phone' : 'desktop'}.png` });
    }
    await page.keyboard.press('Enter');
    await returned(page, 'Expense');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

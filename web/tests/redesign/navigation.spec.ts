import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const engine = process.env.PIRATA_TEST_WEBKIT ? 'webkit' : 'chromium';
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Pirata password').fill('isolated-team-browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Work.', exact: true })).toBeVisible();
}
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });

test('direct navigation, refresh and Back keep the selected page and protect drafts', async ({ page }) => {
  await login(page);
  await page.locator('.workspace-shortcuts').getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page).toHaveURL(/#\/projects$/);
  await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await expect(page).toHaveURL(/#\/projects$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Projects.', exact: true })).toBeVisible();
  await page.locator('.workspace-shortcuts').getByRole('link', { name: 'Calendar', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Projects.', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Calendar.', exact: true })).toBeVisible();
  await expect(mainNav(page).getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.locator('.add-button').click();
  await page.getByLabel('Task title', { exact: true }).fill('Keep this draft');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Discard unsaved changes?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Keep this draft');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Quick Add', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Calendar.', exact: true })).toBeVisible();
});

test('settings remain usable after repeated saves, and Menu search finds every section', async ({ page }) => {
  await login(page);
  await mainNav(page).getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByLabel('Find a page', { exact: true }).fill('finishing');
  await expect(page.locator('.directory-grid > button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Workday settings', exact: true }).click();
  for (const value of ['17:30', '17:00']) {
    await page.getByLabel('End of workday', { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByLabel('End of workday', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('End of workday', { exact: true })).toHaveValue(value);
    await expect(page.locator('form[data-save-phase]')).toHaveAttribute('data-save-phase', 'editing');
  }
  await mainNav(page).getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Menu.', exact: true })).toBeVisible();
  for (const name of ['Projects','Calendar','All tasks','Team Progress','Today','Clients','Inventory','Shopping','Spending','Team accounts','Ask settings & usage','Workday settings','Files']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});

test('phone, tablet and desktop expose clear routes without page overflow', async ({ page }) => {
  await login(page);
  await mkdir('artifacts/redesign/after', { recursive: true });
  for (const width of [320,390,768,1280]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 960 });
    for (const destination of ['work','more','projects','ask'] as const) {
      if (width < 1100) {
        if (destination === 'projects') await page.locator('.workspace-shortcuts').getByRole('link', { name: 'Projects', exact: true }).click();
        else await mainNav(page).getByRole('button', { name: {work:'Work',more:'Menu',ask:'Ask'}[destination], exact: true }).click();
      } else {
        await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name: {work:'Work',more:'Account & more',projects:'Projects',ask:'Ask Morgan'}[destination], exact: true }).click();
      }
      await expect(page.getByRole('heading', {name: {work:'Work.',more:'Menu.',projects:'Projects.',ask:'Ask.'}[destination],exact:true})).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('.content-viewport').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const add = await page.locator('.add-button').boundingBox();
      const brand = await page.locator('.brand-bar').boundingBox();
      const nav = width < 1100 ? await mainNav(page).boundingBox() : null;
      if (process.env.PIRATA_LAYOUT_DEBUG) console.log(JSON.stringify({width,destination,add,brand,nav,viewport:await page.evaluate(()=>({height:innerHeight,scrollY,visualHeight:visualViewport?.height,visualTop:visualViewport?.offsetTop,scale:visualViewport?.scale,bodyHeight:document.body.scrollHeight,htmlHeight:document.documentElement.scrollHeight,appScroll:document.querySelector('.live-app')?.scrollTop}))}));
      expect(brand!.y, 'Header must stay fully in the viewport').toBeGreaterThanOrEqual(0);
      expect(add!.y, 'Add must stay in the viewport').toBeGreaterThanOrEqual(0);
      expect(add!.y+add!.height, 'Add must clear navigation').toBeLessThanOrEqual(nav?.y ?? (width < 768 ? 844 : 960));
      await page.screenshot({ path: `artifacts/redesign/after/${destination}-${engine}-${width}.png` });
    }
    if (width < 1100) await expect(mainNav(page)).toBeVisible();
    else await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  }
});

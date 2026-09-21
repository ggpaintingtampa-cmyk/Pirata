import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { businessDate } from '@pirata/domain/lib/dates';
import type { BusinessCommand, BusinessSnapshot } from '@pirata/contracts/index';

async function command(page: Page, command: BusinessCommand) {
  return page.evaluate(async command => {
    const session = await (await fetch('/api/v1/session')).json();
    const snapshot = await (await fetch('/api/v1/snapshot')).json();
    const response = await fetch('/api/v1/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ requestId: crypto.randomUUID(), baseRevision: snapshot.revision, command }) });
    if (!response.ok) throw Error(await response.text());
    return response.json();
  }, command);
}

test('Figma screens preserve real progress and fit phone, tablet and desktop', async ({ page }) => {
  test.setTimeout(180000);
  const engine = process.env.PIRATA_TEST_WEBKIT ? 'webkit' : 'chromium';
  const output = 'artifacts/figma-20260919';
  await mkdir(output, { recursive: true });
  await page.goto('/');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('');
  await page.screenshot({ scale: 'css', animations: 'disabled', path: `${output}/signin-${engine}-390.png` });
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Pirata password').fill('isolated-team-browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Work.', exact: true })).toBeVisible();
  const initial: BusinessSnapshot = await page.evaluate(async () => (await (await fetch('/api/v1/snapshot')).json()));
  const date = businessDate(initial.serverNow);
  const client = (await command(page, { type: 'client.create', name: 'Riverside Home', phone: '', email: '', note: '' })).result.id;
  const project = (await command(page, { type: 'project.create', name: 'Riverside apartment', clientId: client, clientName: '', address: 'Tampa, Florida', note: 'Doors, walls and finishing touches.' })).result.id;
  const door = (await command(page, { type: 'task.create', title: 'Paint the doors', projectId: project, assigneeId: initial.currentUser!.id, estimatedMinutes: 120, note: '' })).result.id;
  const prep = (await command(page, { type: 'task.create', title: 'Prep, mask and clean doors', parentTaskId: door, projectId: project, estimatedMinutes: 0, note: '' })).result.id;
  await command(page, { type: 'task.create', title: 'Spray paint the doors', parentTaskId: door, projectId: project, estimatedMinutes: 0, note: '' });
  const hallway = (await command(page, { type: 'task.create', title: 'Finish the hallway', projectId: project, assigneeId: initial.currentUser!.id, estimatedMinutes: 60, note: '' })).result.id;
  await command(page, { type: 'task.create', title: 'Clean the surface', parentTaskId: hallway, projectId: project, estimatedMinutes: 0, note: '' });
  await command(page, { type: 'task.create', title: 'Apply the final coat', parentTaskId: hallway, projectId: project, estimatedMinutes: 0, note: '' });
  await command(page, { type: 'dailyGoal.replace', date, userId: initial.currentUser!.id, taskIds: [door, hallway] });
  await command(page, { type: 'task.setStatus', id: prep, status: 'done', expectedSessionId: null });
  await command(page, { type: 'schedule.setTaskBlock', taskId: door, block: { date, startMinute: 540, endMinute: 660, allowOverlap: false } });
  await command(page, { type: 'schedule.setTaskBlock', taskId: hallway, block: { date, startMinute: 780, endMinute: 840, allowOverlap: false } });
  await page.reload();
  await expect(page.getByRole('progressbar', { name: 'Daily completion', exact: true })).toHaveAttribute('aria-valuenow', '25');

  const routes = ['work', 'projects', `project/${project}`, 'tasks', 'ask', 'updates', 'menu', 'calendar', 'files', 'progress', 'settings'];
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 960 });
    for (const route of routes) {
      await page.goto('/#/' + route);
      await expect(page.locator('#main h1')).toHaveText(route.startsWith('project/') ? 'Riverside apartment' : route === 'menu' ? 'Menu.' : route[0].toUpperCase() + route.slice(1) + '.');
      await expect(page.locator('#main h1')).toHaveCount(1);
      await expect(page.locator('#main h1')).toBeVisible();
      const brand = (await page.locator('.brand-bar').boundingBox())!;
      expect(brand.y, `${route} header stays in viewport`).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const overflow = await page.locator('.content-viewport').evaluate(element => ({width:element.clientWidth, scroll:element.scrollWidth, outside:[...element.querySelectorAll('*')].filter(child=>(child.getBoundingClientRect().right>element.getBoundingClientRect().right+1 || child.scrollWidth>child.clientWidth+2)).map(child=>({tag:child.tagName,cls:child.className,right:child.getBoundingClientRect().right, client:child.clientWidth,scroll:child.scrollWidth})).slice(0,12)}));
      if(overflow.scroll>overflow.width) await page.screenshot({scale:'css',path: `${output}/overflow-${engine}-${width}.png`});
      expect(overflow.scroll, route + ' at ' + width + 'px: ' + JSON.stringify(overflow.outside)).toBeLessThanOrEqual(overflow.width);
      const add = (await page.locator('.add-button').boundingBox())!;
      expect(add.width).toBeGreaterThanOrEqual(44);
      expect(add.x).toBeGreaterThanOrEqual(0);
      expect(add.x + add.width).toBeLessThanOrEqual(width);
      if (width < 1100) {
        const nav = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!;
        expect(add.y + add.height).toBeLessThanOrEqual(nav.y);
      }
      await page.mouse.move(0, 0);
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      await page.screenshot({ scale: 'css', animations: 'disabled', path: `${output}/${route.split('/')[0]}-${engine}-${width}.png` });
    }
    await page.goto('/#/tasks');
    await page.getByRole('button', { name: 'Open task: Paint the doors', exact: true }).click();
    const detail = page.getByRole('dialog');
    expect(await detail.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ scale: 'css', animations: 'disabled', path: `${output}/task-detail-${engine}-${width}.png` });
    await detail.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.locator('.add-button').click();
    const addDialog = page.getByRole('dialog', { name: 'Add task', exact: true });
    await expect(addDialog.getByLabel('Task title', { exact: true })).toBeVisible();
    expect(await addDialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ scale: 'css', animations: 'disabled', path: `${output}/add-task-${engine}-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Quick Add', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});

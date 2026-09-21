import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { openDemo, quick, saved, section } from './helpers';
test.beforeEach(async ({ page }) => { await openDemo(page); });
test('header and home sections show the sample workday', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Morgan el Pirata' })).toBeVisible();
  for (const name of ["Today's objectives", 'Current task', "Today's schedule", 'Needs attention', 'Spent today']) await expect(section(page, name)).toBeVisible();
  await expect(section(page, "Today's objectives")).toContainText('0 of 3 complete');
  await expect(section(page, 'Current task')).toContainText('Estimated 2h • Logged 45m');
  await expect(section(page, "Today's schedule").getByRole('listitem')).toHaveCount(8);
  await expect(section(page, 'Needs attention')).toContainText('Need 3 gallons');
  await expect(section(page, 'Spent today')).toContainText('$84.60');
  for (const name of ['Projects', 'Inventory', 'Clients', 'More']) await expect(page.getByRole('button', { name: name + ' Upcoming' })).toBeDisabled();
  await expect(page).toHaveURL('/?demo=1');
});
test('objective completion survives refresh without completing the task', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit objectives' }).click();
  await page.getByLabel('Status for objective 1').selectOption('done');
  await page.getByRole('button', { name: 'Save objectives' }).click();
  await page.reload();
  await expect(section(page, "Today's objectives")).toContainText('1 of 3 complete');
  expect((await saved(page)).tasks[0].status).toBe('open');
});
test('adds $25, then edits the same expense without duplication', async ({ page }) => {
  await quick(page, 'Expense');
  await page.getByLabel('Description', { exact: true }).fill('Brushes');
  await page.getByLabel('Amount ($)', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(section(page, 'Spent today')).toContainText('$109.60');
  await section(page, 'Spent today').getByRole('button', { name: /Brushes/ }).click();
  await page.getByLabel('Amount ($)', { exact: true }).fill('30');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(section(page, 'Spent today')).toContainText('$114.60');
  expect((await saved(page)).expenses.filter(e => e.description === 'Brushes')).toHaveLength(1);
  await page.reload();
  await expect(section(page, 'Spent today')).toContainText('$114.60');
});
test('timer survives refresh, pauses once, switches and finishes without a hidden session', async ({ page }) => {
  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  const first = (await saved(page)).runningTimer!;
  await page.clock.fastForward(65000);
  await page.reload();
  await expect(section(page, 'Current task')).toContainText('Session running');
  await expect(section(page, 'Current task')).toContainText('Logged 46m');
  await page.getByRole('button', { name: 'Pause timer' }).click();
  let state = await saved(page);
  expect(state.runningTimer).toBeNull();
  expect(state.timeEntries.filter(e => e.id === first.sessionId)).toHaveLength(1);
  await page.getByRole('button', { name: 'Start timer' }).click();
  await page.clock.fastForward(5000);
  await page.getByLabel('Choose task', { exact: true }).selectOption('t-coat');
  await page.getByRole('button', { name: 'Start timer' }).click();
  await expect(page.getByRole('dialog')).toContainText('Pause Prepare north wall and start Apply first coat?');
  await page.getByRole('button', { name: 'Pause and switch' }).click();
  expect((await saved(page)).runningTimer?.taskId).toBe('t-coat');
  await page.clock.fastForward(60000);
  await page.getByRole('button', { name: 'Finish task' }).click();
  state = await saved(page);
  expect(state.runningTimer).toBeNull();
  expect(state.tasks.find(t => t.id === 't-coat')?.status).toBe('done');
  await page.reload();
  await expect(page.getByText('Session running', { exact: true })).toHaveCount(0);
});
test('quick task and time forms update the schedule and task total', async ({ page }) => {
  await quick(page, 'Task');
  await page.getByLabel('Task title', { exact: true }).fill('Sand the trim');
  await page.getByLabel('Estimated minutes').fill('30');
  await page.getByLabel('Schedule date').fill('2026-09-16');
  await page.getByLabel('Start time', { exact: true }).fill('17:00');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(section(page, "Today's schedule")).toContainText('Sand the trim');
  const taskId = (await saved(page)).tasks.find(t => t.title === 'Sand the trim')!.id;
  await quick(page, 'Time entry');
  await page.getByLabel('Task', { exact: true }).selectOption(taskId);
  await page.getByLabel('Duration (whole minutes)').fill('20');
  await page.getByRole('button', { name: 'Add time entry', exact: true }).click();
  await expect(section(page, 'Current task')).toContainText('Logged 20m');
});
test('material restock removes shortage and leaves spending unchanged', async ({ page }) => {
  await quick(page, 'Material adjustment');
  await page.getByLabel('Quantity adjustment', { exact: false }).fill('+3');
  await page.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(section(page, 'Needs attention')).not.toContainText('Need 3 gallons');
  await expect(section(page, 'Spent today')).toContainText('$84.60');
  await page.reload();
  expect((await saved(page)).materials[0].stockMinor).toBe(500);
});
test('maintenance and follow-up controls remove their reminders', async ({ page }) => {
  await page.getByRole('button', { name: 'View Clean the sprayer' }).click();
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await expect(section(page, 'Needs attention')).not.toContainText('Clean the sprayer');
  await page.getByRole('button', { name: 'View Follow up with Casey Taylor' }).click();
  await page.getByRole('button', { name: 'Mark followed up' }).click();
  await expect(page.getByText('Enter a follow-up note.')).toBeVisible();
  await page.getByLabel('Follow-up note').fill('Discussed the cabinet finish.');
  await page.getByRole('button', { name: 'Mark followed up' }).click();
  await expect(section(page, 'Needs attention')).not.toContainText('Follow up with Casey Taylor');
  expect((await saved(page)).leads[0].nextFollowUpDate).toBeNull();
});
test('quick lead form exposes a due lead and names a future lead in its success message', async ({ page }) => {
  for (const [name, date] of [['Robin Lane', '2026-09-16'], ['Morgan Lake', '2026-10-01']]) {
    await quick(page, 'Lead');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Work description').fill('Paint the porch');
    await page.getByLabel('Follow-up date (optional)').fill(date);
    await page.getByRole('button', { name: 'Add lead', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Lead added: ' + name);
  }
  await expect(section(page, 'Needs attention')).toContainText('Follow up with Robin Lane');
  await expect(section(page, 'Needs attention')).not.toContainText('Morgan Lake');
  expect((await saved(page)).leads).toHaveLength(3);
});
test('schedule overlaps warn without moving other blocks and overnight input stays editable', async ({ page }) => {
  const before = (await saved(page)).schedule;
  await section(page, "Today's schedule").getByRole('button', { name: /Prepare north wall/ }).click();
  await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
  await page.getByLabel('Start time', { exact: true }).fill('10:30');
  await page.getByLabel('End time (24-hour)').fill('12:00');
  await expect(page.getByRole('status')).toContainText('Schedule overlap');
  await page.getByRole('button', { name: 'Save schedule' }).click();
  const after = (await saved(page)).schedule;
  expect(after.filter(b => b.id !== 's-prep')).toEqual(before.filter(b => b.id !== 's-prep'));
  await section(page, "Today's schedule").getByRole('button', { name: /Prepare north wall/ }).click();
  await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
  await page.getByLabel('Start time', { exact: true }).fill('23:00');
  await page.getByLabel('End time (24-hour)').fill('01:00');
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByText(/Overnight blocks are not supported/)).toBeVisible();
  await expect(page.getByLabel('End time (24-hour)')).toHaveValue('01:00');
});
test('dirty cancellation retains input until explicitly discarded, Escape restores focus', async ({ page }) => {
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await quick(page, 'Expense');
  await page.getByLabel('Description', { exact: true }).fill('Do not save me');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discard unsaved changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Do not save me');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(add).toBeFocused();
  expect((await saved(page)).expenses).toHaveLength(2);
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
  const style = await add.evaluate(el => ({ style: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth }));
  expect(style.style).not.toBe('none'); expect(parseFloat(style.width)).toBeGreaterThanOrEqual(2);
});
test('validation retains invalid amount and focuses the field', async ({ page }) => {
  await quick(page, 'Expense');
  await page.getByLabel('Description', { exact: true }).fill('Brush');
  await page.getByLabel('Amount ($)', { exact: true }).fill('1.234');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByLabel('Amount ($)', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Amount ($)', { exact: true })).toHaveValue('1.234');
  await expect(page.getByText('Enter a positive amount with up to two decimals.')).toBeVisible();
});
test('completed time entries can be explicitly corrected', async ({ page }) => {
  await section(page, 'Current task').getByRole('button', { name: 'Time entries', exact: true }).click();
  await page.getByRole('button', { name: 'Edit time entry' }).click();
  await page.getByLabel('Duration (whole minutes)').fill('50');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(section(page, 'Current task')).toContainText('Logged 50m');
  expect((await saved(page)).timeEntries).toHaveLength(1);
});
test('phone, tablet and desktop layouts fit, scroll, and keep last controls accessible', async ({ page }, testInfo) => {
  for (const [width, height] of [[320, 844], [390, 844], [768, 1024], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await section(page, 'Spent today').getByRole('button', { name: /Fuel/ }).evaluate(el => el.scrollIntoView({ block: 'center' }));
    const target = await section(page, 'Spent today').getByRole('button', { name: /Fuel/ }).boundingBox();
    const nav = await page.getByRole('navigation').boundingBox();
    expect(target!.y + target!.height).toBeLessThan(nav!.y);
    const occluded = await section(page, 'Spent today').getByRole('button', { name: /Fuel/ }).evaluate(el => {
      const rect = el.getBoundingClientRect(), top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return !top || !el.contains(top);
    });
    expect(occluded).toBe(false);
    await page.locator('.content-viewport').evaluate(el => el.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Add', exact: true }).evaluate(el => (el as HTMLElement).blur());
    if (testInfo.project.name === 'chromium') {
      await mkdir('artifacts/screenshots', { recursive: true });
      await page.screenshot({ path: 'artifacts/screenshots/' + (width === 390 ? 'today-phone.png' : width === 1280 ? 'today-desktop.png' : 'today-' + width + '.png') });
    }
    await quick(page, 'Lead');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Add lead', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Add lead', exact: true })).toBeInViewport();
    if (testInfo.project.name === 'chromium' && width === 390) await page.screenshot({ path: 'artifacts/screenshots/lead-dialog-phone.png' });
    await page.keyboard.press('Escape');
  }
});

test('long task names wrap at 320px and form navigation confirms draft discard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await quick(page, 'Task');
  await page.getByLabel('Task title', { exact: true }).fill('N'.repeat(160));
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss success message' }).click();
  const current = section(page, 'Current task');
  expect(await current.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await current.getByRole('button', { name: 'Details' }).click();
  await page.getByLabel('Task title', { exact: true }).fill('Unsaved name');
  await page.getByRole('button', { name: 'Schedule task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discard unsaved changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Unsaved name');
  await page.getByRole('button', { name: 'Schedule task', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Schedule task', exact: true })).toBeVisible();
  expect((await saved(page)).tasks.at(-1)?.title).toBe('N'.repeat(160));
});

import { test, expect, open, command, snapshot, task } from '../tasks-time/helpers';

test('objectives render empty, add three, require blocked note, reorder and persist independently', async ({ page }) => {
  await open(page, 'ObjectiveEditor'); await page.getByLabel('Objective date').fill('2026-10-04'); await expect(page.getByText('Choose up to three outcomes for today.')).toBeVisible();
  const taskId = await task(page, 'Objective linked task'); await page.getByRole('button', { name: 'Refresh snapshot' }).click();
  await page.getByRole('button', { name: 'Edit outcomes' }).click();
  for (let i = 1; i <= 3; i++) { await page.getByRole('button', { name: 'Add outcome' }).click(); await page.getByLabel(`Outcome ${i} title`).fill('Outcome ' + i); }
  await expect(page.getByRole('button', { name: 'Add outcome' })).toBeDisabled(); await page.getByLabel('Outcome 1 linked task').selectOption(taskId);
  await page.getByLabel('Outcome 1 status').selectOption('done'); await page.getByLabel('Outcome 2 status').selectOption('blocked'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Outcome 2 note')).toBeFocused(); await page.getByLabel('Outcome 2 note').fill('Waiting for paint');
  await page.getByRole('button', { name: 'Move outcome 3 up' }).click(); await expect(page.getByLabel('Outcome 2 title')).toHaveValue('Outcome 3');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).tasks.find(t => t.id === taskId)?.status).toBe('open');
  await expect(page.getByText('1 of 3 completed')).toBeVisible(); await page.reload(); await page.getByLabel('Objective date').fill('2026-10-04'); await expect(page.getByText('1 of 3 completed')).toBeVisible();
  expect((await snapshot(page)).objectives.filter(o => o.date === '2026-10-04').sort((a, b) => a.rank - b.rank).map(o => o.title)).toEqual(['Outcome 1', 'Outcome 3', 'Outcome 2']);
});

test('date-scoped objective edits, dirty reorder cancellation and screenshots', async ({ page }) => {
  await open(page, 'ObjectiveEditor'); await page.getByLabel('Objective date').fill('2026-10-05'); await page.getByRole('button', { name: 'Edit outcomes' }).click();
  await page.getByRole('button', { name: 'Add outcome' }).click(); await page.getByLabel('Outcome 1 title').fill('Next date'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const before = await snapshot(page); await page.getByRole('button', { name: 'Edit outcomes' }).click(); await page.getByRole('button', { name: 'Remove outcome 1' }).click(); await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Discard changes' }).click();
  expect((await snapshot(page)).objectives).toEqual(before.objectives);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 }); await page.getByRole('button', { name: 'Edit outcomes' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await page.screenshot({ path: `tests/modules/planning/artifacts/objectives-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Edit outcomes' })).toBeFocused();
  }
});

test('schedule validates date/time, confirms overlap, reschedules one block and removes only it', async ({ page }) => {
  await open(page); const a = await task(page, 'Plan A'), b = await task(page, 'Plan B');
  await command(page, { type: 'schedule.setTaskBlock', taskId: a, block: { date: '2026-10-06', startMinute: 540, endMinute: 600, allowOverlap: false } });
  const original = (await snapshot(page)).schedule.find(x => x.taskId === a)!;
  await open(page, 'ScheduleTaskDialog', { taskId: b }); await page.getByLabel('Planned date').fill('2026-10-06'); await page.getByLabel('Start time').fill('09:30'); await page.getByLabel('End time').fill('09:00');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByLabel('End time')).toBeFocused(); await expect(page.getByLabel('End time')).toHaveValue('09:00');
  await page.getByLabel('End time').fill('10:30'); await expect(page.getByText('This block overlaps:')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByText(/Review and explicitly keep/)).toBeVisible();
  await page.getByLabel('Overlap choice').selectOption('true'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const block = (await snapshot(page)).schedule.find(x => x.taskId === b)!; expect((await snapshot(page)).schedule.find(x => x.taskId === a)).toEqual(original);
  await open(page, 'ScheduleTaskDialog', { taskId: b }); await page.getByLabel('Start time').fill('10:00'); await page.getByLabel('End time').fill('11:00'); await expect(page.getByText('This block overlaps:')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); expect((await snapshot(page)).schedule.filter(x => x.taskId === b)).toHaveLength(1); expect((await snapshot(page)).schedule.find(x => x.id === block.id)?.startMinute).toBe(600);
  await open(page, 'ScheduleTaskDialog', { taskId: b }); await page.getByLabel('Plan action').selectOption('remove'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).schedule.some(x => x.taskId === b)).toBe(false); expect((await snapshot(page)).schedule.find(x => x.taskId === a)).toEqual(original);
});

test('objective uncertain save retries one envelope and stale scheduling requires review', async ({ page }) => {
  await open(page, 'ObjectiveEditor'); await page.getByLabel('Objective date').fill('2026-10-07'); await page.getByRole('button', { name: 'Edit outcomes' }).click(); await page.getByRole('button', { name: 'Add outcome' }).click(); await page.getByLabel('Outcome 1 title').fill('Retry outcome');
  const ids: string[] = []; page.on('request', r => { if (r.url().endsWith('/commands')) ids.push(r.postDataJSON().requestId); });
  await page.route('**/api/v1/commands', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Retry same save' })).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: 'Retry same save' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); expect(ids[1]).toBe(ids[0]); expect((await snapshot(page)).objectives.filter(o => o.date === '2026-10-07')).toHaveLength(1);
  const a = await task(page, 'Stale plan'), b = await task(page, 'New conflicting plan'); await open(page, 'ScheduleTaskDialog', { taskId: a }); await page.getByLabel('Planned date').fill('2026-10-08');
  await command(page, { type: 'schedule.setTaskBlock', taskId: b, block: { date: '2026-10-08', startMinute: 540, endMinute: 600, allowOverlap: false } });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.getByRole('button', { name: 'Load latest records' }).click(); await expect(page.getByLabel('Planned date')).toHaveValue('2026-10-08'); await expect(page.getByText('This block overlaps:')).toBeVisible(); expect((await snapshot(page)).schedule.some(x => x.taskId === a)).toBe(false);
});

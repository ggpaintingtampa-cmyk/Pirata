import type { MutationRequest } from '@pirata/contracts/index';
import { businessDate } from '@pirata/domain/lib/dates';
import { test, expect, openModule, snapshot, command, save, rotateSession, projectInput, materialInput } from '../spending/helpers';

test('phone material creation, reservation editing, restock, shortage and immutable history', async ({ page }) => {
  await openModule(page, 'InventoryView'); const p = (await command(page, projectInput('Inventory exterior'))).result.id!; await openModule(page, 'InventoryView');
  await page.getByRole('button', { name: 'Add material', exact: true }).click(); await page.getByLabel('Material name', { exact: true }).fill('Phone exterior paint'); await page.getByLabel('Product (optional)').fill('Exterior'); await page.getByLabel('Opening stock', { exact: true }).fill('2'); await save(page);
  const m = (await snapshot(page)).materials.find(m => m.name === 'Phone exterior paint')!; expect(m.stockMinor).toBe(200);
  await page.getByRole('button', { name: 'View Phone exterior paint', exact: true }).click(); await page.getByRole('button', { name: 'Add requirement', exact: true }).click();
  await page.getByLabel('Project', { exact: true }).selectOption(p); await page.getByLabel('Needed (gal)', { exact: true }).fill('5'); await page.getByLabel('Reserved (gal)', { exact: true }).fill('2'); await save(page);
  await page.getByRole('button', { name: 'View Phone exterior paint', exact: true }).click(); await expect(page.getByText('Shortage: 3 gallons', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit requirement', exact: true }).click(); await page.getByLabel('Reserved (gal)', { exact: true }).fill('1'); await save(page);
  expect((await snapshot(page)).materialRequirements.filter(r => r.materialId === m.id)).toHaveLength(1);
  const spending = (await snapshot(page)).expenses;
  await page.getByRole('button', { name: 'View Phone exterior paint', exact: true }).click(); await page.getByRole('button', { name: 'Adjust stock', exact: true }).click();
  await page.getByLabel('Stock change (gallons)', { exact: true }).fill('3'); await page.getByLabel('Note (optional)').fill('Afternoon delivery'); await save(page);
  await page.getByRole('button', { name: 'View Phone exterior paint', exact: true }).click(); await expect(page.getByText('No shortage', { exact: true })).toBeVisible(); await expect(page.getByText('Afternoon delivery', { exact: true })).toBeVisible(); await expect(page.getByText('Opening stock', { exact: true })).toBeVisible();
  expect((await snapshot(page)).expenses).toEqual(spending);
  await page.getByRole('button', { name: 'Remove requirement', exact: true }).click(); await save(page, 'Remove requirement');
  await openModule(page, 'MaterialDetail', { materialId: m.id }); await expect(page.getByText('No project requirements.', { exact: true })).toBeVisible(); expect((await snapshot(page)).materials.find(x => x.id === m.id)?.stockMinor).toBe(500);
});
test('equipment create/edit/archive and maintenance complete/reopen retain historical links', async ({ page }) => {
  await openModule(page, 'InventoryView'); await page.getByRole('button', { name: 'Equipment', exact: true }).click(); await page.getByRole('button', { name: 'Add equipment', exact: true }).click();
  await page.getByLabel('Equipment name', { exact: true }).fill('Phone sprayer'); await page.getByLabel('Note (optional)').fill('Flush after use'); await save(page);
  const e = (await snapshot(page)).equipment.find(e => e.name === 'Phone sprayer')!;
  await page.getByRole('button', { name: 'View Phone sprayer', exact: true }).click(); await page.getByRole('button', { name: 'Add maintenance', exact: true }).click();
  await page.getByLabel('Maintenance title').fill('Flush phone sprayer'); await page.getByLabel('Equipment name / historical label', { exact: true }).fill('Original imported sprayer'); await save(page);
  const item = (await snapshot(page)).maintenance.find(m => m.title === 'Flush phone sprayer')!;
  await openModule(page, 'MaintenanceDetail', { maintenanceId: item.id }); await expect(page.getByText('Needs attention', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Complete maintenance', exact: true }).click(); await save(page, 'Complete maintenance');
  await openModule(page, 'InventoryView'); await page.getByRole('button', { name: 'Maintenance', exact: true }).click(); await page.getByLabel('Maintenance filter').selectOption('due'); await expect(page.getByRole('button', { name: 'View Flush phone sprayer', exact: true })).toHaveCount(0);
  await page.getByLabel('Maintenance filter').selectOption('completed'); await page.getByRole('button', { name: 'View Flush phone sprayer', exact: true }).click(); await page.getByRole('button', { name: 'Reopen maintenance', exact: true }).click(); await save(page, 'Reopen maintenance');
  await openModule(page, 'InventoryView', { equipmentId: e.id }); await page.getByRole('button', { name: 'Edit equipment', exact: true }).click(); await page.getByLabel('Equipment name', { exact: true }).fill('Renamed phone sprayer'); await save(page);
  await openModule(page, 'InventoryView', { equipmentId: e.id }); await page.getByRole('button', { name: 'Archive equipment', exact: true }).click(); await save(page, 'Archive equipment');
  await openModule(page, 'MaintenanceDetail', { maintenanceId: item.id }); await expect(page.getByText('Renamed phone sprayer (archived)', { exact: true })).toBeVisible(); await expect(page.getByText('Historical label: Original imported sprayer', { exact: true })).toBeVisible(); await expect(page.getByText('Needs attention', { exact: true })).toBeVisible();
});
test('piece fractions and excess decimals focus invalid fields; dirty Cancel retains draft without writes', async ({ page }) => {
  await openModule(page, 'InventoryView'); const count = (await snapshot(page)).materials.length;
  await page.getByRole('button', { name: 'Add material', exact: true }).click(); await page.getByLabel('Material name', { exact: true }).fill('Invalid tape'); await page.getByLabel('Unit', { exact: true }).selectOption('piece'); await page.getByLabel('Opening stock', { exact: true }).fill('1.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByLabel('Opening stock', { exact: true })).toBeFocused(); await expect(page.getByLabel('Opening stock', { exact: true })).toHaveValue('1.5');
  await page.getByLabel('Unit', { exact: true }).selectOption('gal'); await page.getByLabel('Opening stock', { exact: true }).fill('1.555'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByLabel('Opening stock', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Keep editing' }).click(); await expect(page.getByLabel('Opening stock', { exact: true })).toHaveValue('1.555');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Discard changes' }).click(); expect((await snapshot(page)).materials).toHaveLength(count);
});
test('interrupted adjustment plus CSRF recovery retains envelope and changes stock once', async ({ page }) => {
  await openModule(page, 'InventoryView'); const m = (await command(page, materialInput('Retry paint'))).result.id!; await openModule(page, 'MaterialDetail', { materialId: m });
  await page.getByRole('button', { name: 'Adjust stock', exact: true }).click(); await page.getByLabel('Stock change (gallons)', { exact: true }).fill('3');
  const requests: MutationRequest[] = []; page.on('request', r => { if (r.url().endsWith('/api/v1/commands')) requests.push(r.postDataJSON()); });
  await page.route('**/api/v1/commands', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Retry same save' })).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await rotateSession(page); await page.getByRole('button', { name: 'Retry same save' }).click(); await expect(page.getByRole('alert')).toContainText('sign-in'); await save(page, 'Retry same save');
  const s = await snapshot(page); expect(s.materials.find(x => x.id === m)?.stockMinor).toBe(500); expect(s.materialAdjustments.filter(a => a.materialId === m)).toHaveLength(2); expect(requests).toHaveLength(3); expect(requests[1]).toEqual(requests[0]); expect(requests[2]).toEqual(requests[0]);
});
test('server reservation rejection keeps adjustment draft; shared free stock is not double allocated', async ({ page }) => {
  await openModule(page, 'InventoryView'); const m = (await command(page, materialInput('Reserved paint'))).result.id!, p = (await command(page, projectInput('Reservation A'))).result.id!, q = (await command(page, projectInput('Reservation B'))).result.id!;
  await command(page, { type: 'requirement.set', materialId: m, projectId: p, neededMinor: 300, reservedMinor: 200 }); await command(page, { type: 'requirement.set', materialId: m, projectId: q, neededMinor: 300, reservedMinor: 0 });
  await openModule(page, 'MaterialDetail', { materialId: m }); await expect(page.getByText('Shortage: 1 gallon', { exact: true })).toBeVisible(); await expect(page.getByText('Shortage: 3 gallons', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adjust stock', exact: true }).click(); await page.getByLabel('Stock change (gallons)', { exact: true }).fill('-1'); await page.getByLabel('Reason', { exact: true }).selectOption('usage'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('reservations'); await expect(page.getByLabel('Stock change (gallons)', { exact: true })).toHaveValue('-1');
  expect((await snapshot(page)).materials.find(x => x.id === m)?.stockMinor).toBe(200);
});
test('maintenance edit retains fallback and future due date is excluded from due filter', async ({ page }) => {
  await openModule(page, 'InventoryView'); const item = (await command(page, { type: 'maintenance.create', title: 'Future compressor check', equipmentId: null, equipmentName: 'Historical compressor', dueDate: '2099-09-17' })).result.id!;
  await openModule(page, 'MaintenanceDetail', { maintenanceId: item }); await page.getByRole('button', { name: 'Edit maintenance', exact: true }).click(); await page.getByLabel('Maintenance title').fill('Future compressor service'); await save(page);
  expect((await snapshot(page)).maintenance.find(m => m.id === item)?.equipmentName).toBe('Historical compressor');
  await openModule(page, 'InventoryView'); await page.getByRole('button', { name: 'Maintenance', exact: true }).click(); await page.getByLabel('Maintenance filter').selectOption('due'); await expect(page.getByRole('button', { name: 'View Future compressor service', exact: true })).toHaveCount(0);
  await page.getByLabel('Maintenance filter').selectOption('open'); await expect(page.getByRole('button', { name: 'View Future compressor service', exact: true })).toBeVisible();
});
test('inventory conflict review retains draft; acknowledged adjustment retries only refresh', async ({ page }) => {
  await openModule(page, 'InventoryView'); const m = (await command(page, materialInput('Conflict inventory'))).result.id!; await openModule(page, 'MaterialDetail', { materialId: m });
  await page.getByRole('button', { name: 'Adjust stock', exact: true }).click(); await page.getByLabel('Stock change (gallons)', { exact: true }).fill('1'); await command(page, projectInput('Other inventory work'));
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Load latest records' })).toBeVisible(); await page.getByRole('button', { name: 'Load latest records' }).click(); await expect(page.getByLabel('Stock change (gallons)', { exact: true })).toBeEnabled(); await expect(page.getByLabel('Stock change (gallons)', { exact: true })).toHaveValue('1');
  let writes = 0; page.on('request', r => { if (r.url().endsWith('/api/v1/commands')) writes++; }); await page.route('**/api/v1/snapshot', route => route.abort('failed'), { times: 1 });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Reload saved record' })).toBeVisible(); await save(page, 'Reload saved record'); expect(writes).toBe(1); expect((await snapshot(page)).materials.find(x => x.id === m)?.stockMinor).toBe(300);
});
test('inventory layouts and dialog replacement fit 320/390/768/1280 and restore focus', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openModule(page, 'InventoryView'); const s = await snapshot(page); expect(businessDate(s.serverNow)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  for (const [width, height] of [[320, 760], [390, 844], [768, 1024], [1280, 900]]) {
    await page.setViewportSize({ width, height }); await openModule(page, 'InventoryView'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 || width === 1280) await page.screenshot({ path: `tests/modules/inventory/artifacts/inventory-${width}.png`, fullPage: true });
    const add = page.getByRole('button', { name: 'Add material', exact: true }); expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44); await add.click(); await expect(page.getByLabel('Material name', { exact: true })).toBeFocused();
    const box = (await page.getByRole('dialog').boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.height).toBeLessThanOrEqual(height);
    if (width === 390) await page.screenshot({ path: 'tests/modules/inventory/artifacts/material-dialog-390.png' });
    await page.keyboard.press('Escape'); await expect(add).toBeFocused();
  }
  expect(errors).toEqual([]);
});

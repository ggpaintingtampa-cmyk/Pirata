import { test, expect } from '@playwright/test';
import { openModule } from './helpers';
test('isolated UI mount authenticates with real SQLite API and mounts a compiled module',async({page})=>{
  await openModule(page,'clients-projects','ClientsView');
  await expect(page.getByTestId('module-view')).toBeVisible();
  const cookies=await page.context().cookies();const session=cookies.find(c=>c.name==='__Host-pirata_session')!;
  expect(session.httpOnly).toBe(true);expect(session.secure).toBe(true);expect(session.sameSite).toBe('Lax');
  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
  await page.reload();await expect(page.getByTestId('module-view')).toBeVisible();
});

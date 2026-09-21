import { expect, type Page } from '@playwright/test';
/** Test process always owns a fresh /tmp SQLite database on 3002. */
export async function openModule(page:Page,module:string,view:string,selection:Record<string,string>={}){
  await page.goto('/tests/module-harness/?'+new URLSearchParams({module,view,...selection}));
  const password=page.getByLabel('Fixture password');
  if(await password.isVisible()){await password.fill('isolated-harness-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();}
  await expect(page.getByRole('heading',{name:'Isolated module harness'})).toBeVisible();
  await expect(password).toHaveCount(0);
}

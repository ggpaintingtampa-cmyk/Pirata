import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { BusinessCommand, BusinessSnapshot } from '@pirata/contracts/index';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username', {exact: true}).fill('owner');
  await page.getByLabel('Pirata password').fill('isolated-team-browser-password');
  await page.getByRole('button', {name: 'Sign in', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Daily.', exact: true})).toBeVisible();
}
async function command(page: Page, command: BusinessCommand) {
  return page.evaluate(async command => {
    const session = await (await fetch('/api/v1/session')).json(), snapshot = await (await fetch('/api/v1/snapshot')).json();
    const response = await fetch('/api/v1/commands', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken}, body: JSON.stringify({requestId: crypto.randomUUID(), baseRevision: snapshot.revision, command})});
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }, command);
}
async function seed(page: Page, suffix: string) {
  const member = await page.evaluate(async suffix => {
    const session = await (await fetch('/api/v1/session')).json();
    const response = await fetch('/api/v1/admin/team', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken}, body: JSON.stringify({name: 'Inhris '+suffix, username: 'inhris-'+suffix, password: 'synthetic-test-password'})});
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }, suffix);
  const client = (await command(page, {type:'client.create',name:'Synthetic client',phone:'',email:'',note:''})).result.id;
  const project = (await command(page, {type:'project.create',name:'Preparación y pintura de todas las habitaciones de la casa',clientId:client,clientName:'',address:'',note:''})).result.id;
  const create = async (title: string, assigneeId: string|null, parentTaskId: string|null = null) => (await command(page, {type:'task.create',title,projectId:project,parentTaskId,assigneeId,estimatedMinutes:60,note:''})).result.id as string;
  const assigned = await create('Assigned without any day plan',member.id);
  const child = await create('A very long inherited child task for the employee to complete',null,assigned);
  const done = await create('Already finished assignment',member.id);
  await command(page,{type:'task.setStatus',id:done,status:'done',expectedSessionId:null});
  const unassigned = await create('Unassigned task to assign from Today',null);
  await page.reload();
  return {member:{...member,name:'Inhris '+suffix},project,assigned,child,done,unassigned};
}
async function snapshot(page: Page): Promise<BusinessSnapshot> {return page.evaluate(async () => (await fetch('/api/v1/snapshot')).json());}

test('Spanish employee filters and selection controls fit phone widths',async({page})=>{
  await login(page);
  const {member}=await seed(page,'layout');
  await command(page,{type:'user.setLocale',locale:'es'});
  await page.reload();
  await page.getByRole('button',{name:'Todas las tareas',exact:true}).click();
  await page.getByRole('combobox',{name:'Filtro por responsable',exact:true}).selectOption(member.id);
  await expect(page.locator('.task-library-item')).toHaveCount(2);
  await mkdir('artifacts/screenshots',{recursive:true});
  await page.screenshot({path:'artifacts/screenshots/employee-spanish-filter.png',fullPage:true});
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px page overflow`).toBe(true);
    for(const control of await page.locator('.task-results-heading button, .task-filters select').all()){
      const box=(await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
    }
  }
  await page.setViewportSize({width:320,height:900});
  await page.getByRole('button',{name:'Seleccionar',exact:true}).click();
  const firstRow=page.locator('.task-library-item').first();
  const checkbox=(await firstRow.getByRole('checkbox').boundingBox())!;
  const taskButton=(await firstRow.locator('.task-library-open').boundingBox())!;
  expect(checkbox.x+checkbox.width).toBeLessThanOrEqual(taskButton.x);
  expect(taskButton.x+taskButton.width).toBeLessThanOrEqual(320);
  await page.screenshot({path:'artifacts/screenshots/employee-spanish-selection-320.png',fullPage:true});
  await command(page,{type:'user.setLocale',locale:'en'});
});

test('Today shows all employee assignments, assigns without a date, and saves that employee’s day plan',async({page})=>{
  await login(page);
  const {member,assigned,child,done,unassigned}=await seed(page,'planning');
  await page.getByRole('combobox',{name:'Employee / project',exact:true}).selectOption('person:'+member.id);
  await expect(page.getByText('Nothing planned for this day.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^All assigned tasks/}).click();
  await expect(page.locator('.task-library-item')).toHaveCount(3);
  await page.screenshot({path:'artifacts/screenshots/employee-today-all-assigned.png',fullPage:true});
  for(const id of [assigned,child,done]) expect((await snapshot(page)).tasks.find(task=>task.id===id)?.assigneeId).toBe(member.id);
  await page.getByRole('button',{name:'Assign tasks',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('combobox',{name:'Task to assign',exact:true}).selectOption(unassigned);
  await dialog.getByRole('button',{name:'Assign to '+member.name,exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.task-library-item')).toHaveCount(4);
  let state=await snapshot(page);
  expect(state.tasks.find(task=>task.id===unassigned)?.assigneeId).toBe(member.id);
  expect(state.dayAssignments?.filter(row=>row.userId===member.id)).toHaveLength(0);
  await page.getByRole('button',{name:'Plan this day',exact:true}).click();
  await expect(dialog).toContainText(member.name);
  await dialog.locator('.plan-node-row').filter({hasText:'Unassigned task to assign from Today'}).filter({hasText:member.name}).getByRole('button',{name:'Add',exact:true}).click();
  await dialog.getByRole('button',{name:'Save plan',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:/^Day plan/}).click();
  await expect(page.getByTestId('day-card')).toHaveCount(1);
  await expect(page.getByTestId('day-card')).toContainText('Unassigned task to assign from Today');
  state=await snapshot(page);
  expect(state.dayAssignments?.filter(row=>row.userId===member.id).map(row=>row.taskId)).toEqual([unassigned]);
  await command(page,{type:'user.setLocale',locale:'es'});
  await page.reload();
  await page.getByRole('combobox',{name:'Empleado / proyecto',exact:true}).selectOption('person:'+member.id);
  await page.getByRole('button',{name:/^Todas las tareas asignadas/}).click();
  await expect(page.locator('.task-library-item')).toHaveCount(4);
  await expect(page.locator('.day-view-toggle button[aria-pressed=true]')).toHaveCSS('background-color','rgb(229, 169, 59)');
  await page.screenshot({path:'artifacts/screenshots/employee-today-spanish.png',fullPage:true});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:900});
    for(const control of await page.locator('.day-header select, .day-view-toggle button, .day-employee-actions button').all()){
      const box=(await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
    }
  }
  await command(page,{type:'user.setLocale',locale:'en'});
});

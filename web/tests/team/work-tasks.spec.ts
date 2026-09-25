import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { BusinessSnapshot, BusinessCommand } from '@pirata/contracts/index';

const password='isolated-team-browser-password';
async function login(page:Page,username='owner') {
  await page.goto('/');
  await page.getByLabel('Username',{exact:true}).fill(username);
  await page.getByLabel('Pirata password').fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Work.',exact:true})).toBeVisible();
}
async function snapshot(page:Page):Promise<BusinessSnapshot> {
  return page.evaluate(async()=> (await fetch('/api/v1/snapshot')).json());
}
async function command(page:Page,command:BusinessCommand) {
  return page.evaluate(async command=>{
    const session=await(await fetch('/api/v1/session')).json(),state=await(await fetch('/api/v1/snapshot')).json();
    const response=await fetch('/api/v1/commands',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({requestId:crypto.randomUUID(),baseRevision:state.revision,command})});
    if(!response.ok)throw Error(await response.text());
    return response.json();
  },command);
}

test('owner and employee Work filters, reassignment recovery, subtask editing and phone layouts',async({page,browser,baseURL})=>{
  await login(page);
  const username='work-painter';
  const member=await page.evaluate(async({username,password})=>{
    const session=await(await fetch('/api/v1/session')).json();
    const response=await fetch('/api/v1/admin/team',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({name:'Jose Work',username,password})});
    if(!response.ok)throw Error(await response.text());
    return response.json();
  },{username,password});
  // Read the accepted snapshot rather than assuming the administration response shape.
  expect(member).toBeTruthy();
  let state=await snapshot(page);
  const jose=state.team!.find(person=>person.username===username)!,owner=state.currentUser!;
  const client=(await command(page,{type:'client.create',name:'Work filter client',phone:'',email:'',note:''})).result.id;
  const project=(await command(page,{type:'project.create',name:'Work filter job',clientId:client,clientName:'',address:'',note:''})).result.id;
  const parent=(await command(page,{type:'task.create',title:'Work doors',projectId:project,assigneeId:owner.id,estimatedMinutes:90,note:'Keep this parent note'})).result.id;
  const child=(await command(page,{type:'task.create',title:'Work prep',parentTaskId:parent,projectId:null,assigneeId:null,estimatedMinutes:20,note:'Keep this child note'})).result.id;
  const explicit=(await command(page,{type:'task.create',title:'Work explicit step',parentTaskId:parent,projectId:null,assigneeId:owner.id,estimatedMinutes:0,note:''})).result.id;
  const loose=(await command(page,{type:'task.create',title:'Work unassigned',projectId:null,estimatedMinutes:0,note:''})).result.id;
  const blocked=(await command(page,{type:'task.create',title:'Work blocked',projectId:null,assigneeId:jose.id,estimatedMinutes:0,note:''})).result.id;
  await command(page,{type:'task.setStatus',id:blocked,status:'blocked',expectedSessionId:null});
  const scheduled=(await command(page,{type:'task.create',title:'Work scheduled',projectId:null,assigneeId:jose.id,estimatedMinutes:30,note:''})).result.id;
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(state.serverNow));
  await command(page,{type:'schedule.setTaskBlock',taskId:scheduled,block:{date,startMinute:600,endMinute:630,allowOverlap:true}});
  for(let n=1;n<=4;n++){
    const id=(await command(page,{type:'task.create',title:'Work done '+n,projectId:null,assigneeId:jose.id,estimatedMinutes:0,note:''})).result.id;
    await command(page,{type:'task.setStatus',id,status:'done',expectedSessionId:null});
  }
  await page.reload();
  const team=page.getByRole('region',{name:'Team tasks',exact:true});
  await team.getByLabel('Search tasks',{exact:true}).fill('Work');
  await expect(team.getByRole('button',{name:'Work blocked',exact:true})).toBeVisible();
  await team.getByLabel('Person',{exact:true}).selectOption('unassigned');
  await expect(team.getByRole('button',{name:'Work unassigned',exact:true})).toBeVisible();
  await expect(team.getByRole('button',{name:'Work doors',exact:true})).toHaveCount(0);
  await team.getByLabel('Person',{exact:true}).selectOption('all');
  await team.getByLabel('Project',{exact:true}).selectOption(project);
  await expect(team.locator('.work-my-task-row')).toHaveCount(3);
  await team.getByRole('button',{name:'Reassign Work doors',exact:true}).click();
  const assignment=page.getByRole('dialog',{name:'Assign task',exact:true});
  await assignment.getByLabel('Responsible person',{exact:true}).selectOption(jose.id);
  const requests:string[]=[];
  await page.route('**/api/v1/commands',async route=>{
    requests.push(route.request().postDataJSON().requestId);
    if(requests.length===1){expect((await route.fetch()).ok()).toBe(true);await route.abort('failed');}
    else await route.continue();
  });
  await assignment.getByRole('button',{name:'Save',exact:true}).click();
  await expect(assignment.getByRole('button',{name:'Retry same save',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(assignment).toBeVisible();
  await assignment.getByRole('button',{name:'Retry same save',exact:true}).click();
  await expect(assignment).toHaveCount(0);
  expect(requests).toHaveLength(2);expect(requests[0]).toBe(requests[1]);
  await page.unroute('**/api/v1/commands');
  state=await snapshot(page);
  expect(state.tasks.find(task=>task.id===parent)).toMatchObject({assigneeId:jose.id,estimatedMinutes:90,note:'Keep this parent note',projectId:project});
  expect(state.tasks.find(task=>task.id===child)).toMatchObject({assigneeId:jose.id,assignmentExplicit:0});
  expect(state.tasks.find(task=>task.id===explicit)?.assigneeId).toBe(owner.id);
  await team.getByRole('button',{name:'Reassign Work doors',exact:true}).click();
  await command(page,{type:'task.update',id:parent,title:'Work doors',projectId:project,assigneeId:jose.id,parentTaskId:null,estimatedMinutes:95,note:'Updated from another device'});
  await assignment.getByRole('button',{name:'Save',exact:true}).click();
  await expect(assignment.getByRole('button',{name:'Load latest records',exact:true})).toBeVisible();
  await assignment.getByRole('button',{name:'Load latest records',exact:true}).click();
  await assignment.getByRole('button',{name:'Save',exact:true}).click();
  await expect(assignment).toHaveCount(0);
  state=await snapshot(page);
  expect(state.tasks.find(task=>task.id===parent)).toMatchObject({assigneeId:jose.id,note:'Updated from another device',estimatedMinutes:95});
  await command(page,{type:'dailyGoal.replace',userId:jose.id,date,taskIds:[parent]});
  await page.reload();
  await team.getByLabel('Project',{exact:true}).selectOption('all');
  await team.getByRole('group',{name:'Work task view'}).getByRole('button',{name:'Today',exact:true}).click();
  await expect(team.getByRole('button',{name:'Work prep',exact:true})).toBeVisible();
  await expect(team.getByRole('button',{name:'Work scheduled',exact:true})).toBeVisible();
  await expect(team.getByRole('button',{name:'Work unassigned',exact:true})).toHaveCount(0);
  await team.getByRole('button',{name:'Reset filters',exact:true}).click();
  const engine=process.env.PIRATA_TEST_WEBKIT?'webkit':'chromium';
  await mkdir('artifacts/work-tasks',{recursive:true});
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:width>=768?960:844});
    await team.scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await team.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    await page.screenshot({path:'artifacts/work-tasks/owner-'+engine+'-'+width+'.png',fullPage:true});
  }
  const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport:{width:390,height:844},timezoneId:'America/New_York'});
  const employee=await context.newPage();
  await login(employee,username);
  const mine=employee.getByRole('region',{name:'My tasks',exact:true});
  await expect(mine.getByRole('button',{name:'Work prep',exact:true})).toBeVisible();
  await expect(mine.getByRole('button',{name:'Work blocked',exact:true})).toBeVisible();
  await expect(mine.getByRole('button',{name:'Work explicit step',exact:true})).toHaveCount(0);
  await expect(mine.getByLabel('Person',{exact:true})).toHaveCount(0);
  await expect(mine.getByRole('button',{name:/Reassign/})).toHaveCount(0);
  await mine.getByRole('group',{name:'Work task status'}).getByRole('button',{name:'Completed',exact:true}).click();
  await expect(mine.locator('.work-my-task-row')).toHaveCount(4);
  await mine.getByRole('button',{name:'Reset filters',exact:true}).click();
  await mine.getByRole('button',{name:'Today',exact:true}).click();
  await expect(mine.getByRole('button',{name:'Work blocked',exact:true})).toHaveCount(0);
  await expect(mine.getByRole('button',{name:'Work scheduled',exact:true})).toBeVisible();
  await mine.getByRole('button',{name:'Work prep',exact:true}).click();
  const detail=employee.getByRole('dialog',{name:'Subtask details',exact:true});
  await expect(detail.getByText('Subtask of Work doors · assignment inherited',{exact:true})).toBeVisible();
  await expect(detail.getByRole('region',{name:'Subtasks',exact:true})).toHaveCount(0);
  const editBounds=await detail.getByRole('button',{name:'Edit subtask',exact:true}).boundingBox();
  expect(editBounds).not.toBeNull();
  expect(editBounds!.y+editBounds!.height).toBeLessThanOrEqual(844);
  await detail.getByRole('button',{name:'Edit subtask',exact:true}).click();
  const edit=employee.getByRole('dialog',{name:'Edit subtask',exact:true});
  await edit.getByLabel('Task title',{exact:true}).fill('Work prep edited');
  await edit.getByLabel('Estimated minutes (optional)',{exact:true}).fill('25');
  await employee.keyboard.press('Escape');
  await expect(edit.getByText('Discard unsaved changes?',{exact:true})).toBeVisible();
  await edit.getByRole('button',{name:'Keep editing',exact:true}).click();
  await edit.getByRole('button',{name:'Save',exact:true}).click();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading',{name:'Work prep edited',exact:true})).toBeVisible();
  await employee.screenshot({path:'artifacts/work-tasks/subtask-'+engine+'-390.png',fullPage:true});
  state=await snapshot(employee);
  expect(state.tasks.find(task=>task.id===child)).toMatchObject({title:'Work prep edited',estimatedMinutes:25,parentTaskId:parent,projectId:project,assigneeId:jose.id,assignmentExplicit:0,note:'Keep this child note'});
  await detail.getByRole('button',{name:'Back to parent task',exact:true}).click();
  await expect(employee.getByRole('dialog',{name:'Task details',exact:true}).getByRole('heading',{name:'Work doors',exact:true})).toBeVisible();
  await employee.getByRole('button',{name:'Close dialog',exact:true}).click();
  await mine.scrollIntoViewIfNeeded();
  await employee.screenshot({path:'artifacts/work-tasks/employee-'+engine+'-390.png',fullPage:true});
  expect(state.tasks.find(task=>task.id===loose)?.assigneeId).toBeNull();
  await context.close();
});

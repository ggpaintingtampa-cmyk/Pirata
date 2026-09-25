import { expect, test, type Page } from '@playwright/test';
import type { BusinessSnapshot, BusinessCommand } from '@pirata/contracts/index';

// Chunk A: a manager plans a worker's day the night before; the worker sees the ordered list, checks a tiny task and asks a question.
const password='isolated-team-browser-password';
async function login(page:Page,username='owner') {
  await page.goto('/');
  await page.getByLabel('Username',{exact:true}).fill(username);
  await page.getByLabel('Pirata password').fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Daily.',exact:true})).toBeVisible();
}
async function snapshot(page:Page):Promise<BusinessSnapshot> { return page.evaluate(async()=> (await fetch('/api/v1/snapshot')).json()); }
async function command(page:Page,command:BusinessCommand) {
  return page.evaluate(async command=>{
    const session=await(await fetch('/api/v1/session')).json(),state=await(await fetch('/api/v1/snapshot')).json();
    const response=await fetch('/api/v1/commands',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({requestId:crypto.randomUUID(),baseRevision:state.revision,command})});
    if(!response.ok)throw Error(await response.text());
    return response.json();
  },command);
}
async function admin(page:Page,body:Record<string,unknown>) {
  return page.evaluate(async body=>{
    const session=await(await fetch('/api/v1/session')).json();
    const response=await fetch('/api/v1/admin/team',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify(body)});
    if(!response.ok)throw Error(await response.text());
    return response.json();
  },body);
}

test('the owner plans a worker’s day; the worker sees the ordered tree, completes a tiny task and asks a question',async({page,browser,baseURL})=>{
  await login(page);
  const worker=await admin(page,{name:'Jose Daily',username:'daily-painter',password,role:'worker'});
  const client=(await command(page,{type:'client.create',name:'Smith',phone:'',email:'',note:''})).result.id as string;
  const project=(await command(page,{type:'project.create',name:'Smith room',clientId:client,clientName:'',address:'',note:''})).result.id as string;
  const root=(await command(page,{type:'task.create',title:'Move furniture',projectId:project,estimatedMinutes:0,note:'',description:'Be careful'})).result.id as string;
  const sub=(await command(page,{type:'task.create',title:'Cover desk with plastic',projectId:project,parentTaskId:root,estimatedMinutes:0,note:''})).result.id as string;
  await command(page,{type:'task.create',title:'Use delicate tape',projectId:project,parentTaskId:sub,estimatedMinutes:0,note:''});
  const prep=(await command(page,{type:'task.create',title:'Prep floors',projectId:project,estimatedMinutes:0,note:''})).result.id as string;
  const state=await snapshot(page);
  const date=state.timezone==='America/New_York'?new Date(state.serverNow).toISOString().slice(0,10):'2026-09-26';
  await command(page,{type:'dayList.replace',date,scope:{kind:'person',userId:worker.id},taskIds:[prep,root]});

  const context=await browser.newContext({baseURL});
  const phone=await context.newPage();
  await phone.setViewportSize({width:390,height:844});
  await login(phone,'daily-painter');
  const cards=phone.getByTestId('day-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Prep floors');
  await expect(cards.nth(1)).toContainText('Move furniture');
  await expect(cards.nth(1)).toContainText('Be careful');
  await expect(cards.nth(1)).toContainText('Use delicate tape');
  await phone.getByRole('button',{name:'Use delicate tape',exact:true}).click();
  await expect(cards.nth(1)).toHaveClass(/is-done/);
  await cards.nth(1).getByRole('button',{name:'Details'}).click();
  await phone.getByRole('button',{name:'Ask a question'}).click();
  await phone.getByLabel('Your question').fill('Which tape for the delicate paint?');
  await phone.getByRole('button',{name:'Save',exact:true}).click();
  const after=await snapshot(phone);
  expect(after.taskQuestions?.some(question=>question.body.startsWith('Which tape'))).toBe(true);
  expect(after.tasks.find(task=>task.title==='Use delicate tape')?.completedBy).toBe(worker.id);
  await context.close();
});

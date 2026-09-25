import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { createDemoState } from '../../src/data/demo';
import type { BusinessSnapshot, BusinessCommand } from '@pirata/contracts/index';
import { mkdir } from 'node:fs/promises';
// Update 2026-09-25: the owner workspace opens on Daily; the Today screen and Quick Add menu were retired, so this suite covers import, spending, conflicts, retry, layout, export and sign-out on the new shell.
const key='morgan-el-pirata:home-prototype:v1';
let page:Page,context:BrowserContext,original:string;
async function snapshot(p=page):Promise<BusinessSnapshot>{return p.evaluate(async()=>{const r=await fetch('/api/v1/snapshot');if(!r.ok)throw new Error('Snapshot unavailable');return r.json();});}
async function mutate(p:Page,command:BusinessCommand){return p.evaluate(async command=>{const session=await(await fetch('/api/v1/session')).json(),s=await(await fetch('/api/v1/snapshot')).json();const r=await fetch('/api/v1/commands',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({requestId:crypto.randomUUID(),baseRevision:s.revision,command})});if(!r.ok)throw new Error(await r.text());return r.json();},command);}
async function signIn(p:Page){await p.goto('/');await p.getByLabel('Username',{exact:true}).fill('owner');await p.getByLabel('Pirata password').fill('isolated-harness-password');await p.getByRole('button',{name:'Sign in',exact:true}).click();await expect(p.getByRole('heading',{name:'Daily.',exact:true})).toBeVisible();}
async function nav(name:string,p=page){
 const destination=name==='More'?'Menu':name,navigation=p.getByRole('navigation',{name:'Main navigation'});
 if(await navigation.isVisible()){
  if(['Daily','Ask','Updates','Menu'].includes(destination)){await navigation.getByRole('button',{name:destination,exact:true}).click();return;}
  await navigation.getByRole('button',{name:'Menu',exact:true}).click();await p.getByRole('main').getByRole('button',{name:destination,exact:true}).click();return;
 }
 const sidebar=p.getByRole('navigation',{name:'Workspace sections'});await expect(sidebar).toBeVisible();
 await sidebar.getByRole('link',{name:destination==='Menu'?'Account & more':destination==='Ask'?'Ask Morgan':destination,exact:true}).click();
}
async function add(name:string){await page.locator('.add-button').click();await page.getByRole('dialog',{name:'Add',exact:true}).getByRole('button',{name:new RegExp('^'+name)}).click();}
async function save(){await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);}
test.describe.serial('integrated owner workspace',()=>{
 test.beforeAll(async({browser})=>{context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});page=await context.newPage();});
 test.afterAll(async()=>{await context.close();});
 test('starts empty, imports deliberately and preserves original local storage',async()=>{
  await signIn(page);expect((await snapshot()).tasks).toHaveLength(0);expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
  original=JSON.stringify(createDemoState(Date.now()));await page.evaluate(({key,original})=>localStorage.setItem(key,original),{key,original});await nav('More');await page.getByRole('button',{name:"Read this browser's demo",exact:true}).click();await page.getByRole('button',{name:'Preview import',exact:true}).click();await expect(page.getByRole('heading',{name:'Import preview',exact:true})).toBeVisible();expect((await snapshot()).tasks).toHaveLength(0);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm import',exact:true}).click();await expect(page.getByText('Import completed.',{exact:false})).toBeVisible();
  const imported=await snapshot();expect(imported.tasks.length).toBeGreaterThan(0);expect(imported.clients.some(c=>c.name==='Alex Smith')).toBe(true);expect(imported.projects.every(p=>p.status==='scheduled'||p.status==='completed')).toBe(true);expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(original);
  await nav('Daily');await expect(page.getByRole('heading',{name:'Daily.',exact:true})).toBeVisible();
 });
 test('an expense added from the Add menu can be edited in Spending without duplicate records',async()=>{
  const before=(await snapshot()).expenses.length;
  await add('Expense');await page.getByLabel('Description',{exact:true}).fill('Integration brushes');await page.getByLabel('Amount ($)',{exact:true}).fill('25');await save();
  expect((await snapshot()).expenses.filter(e=>e.description==='Integration brushes').map(e=>e.amountCents)).toEqual([2500]);
  await nav('Spending');await page.getByRole('button',{name:'Edit Integration brushes',exact:true}).click();await page.getByLabel('Amount ($)',{exact:true}).fill('30');await save();
  await page.reload();const expenses=(await snapshot()).expenses;expect(expenses).toHaveLength(before+1);expect(expenses.filter(e=>e.description==='Integration brushes').map(e=>e.amountCents)).toEqual([3000]);
 });
 test('conflicts are visible across independent browsers even after background refresh',async({browser})=>{
  const other=await browser.newContext(),second=await other.newPage();await signIn(second);
  await nav('Clients');await page.getByRole('button',{name:/Alex Smith/}).click();await page.getByRole('button',{name:'Edit client',exact:true}).click();await page.getByLabel('Notes (optional)').fill('Draft from first browser');const client=(await snapshot()).clients.find(c=>c.name==='Alex Smith')!;
  await mutate(second,{type:'client.update',id:client.id,name:client.name,phone:'555-0109',email:client.email,note:'Updated elsewhere'});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(async()=>page.evaluate(async()=> (await(await fetch('/api/v1/snapshot')).json()).revision)).toBe((await snapshot(second)).revision);
  await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Records changed'})).toBeVisible();expect((await snapshot()).clients.find(c=>c.id===client.id)?.phone).toBe('555-0109');await page.getByRole('button',{name:'Load latest records'}).click();await page.getByLabel('Phone (optional)').fill('555-0109');await save();
  await second.evaluate(()=>window.dispatchEvent(new Event('focus')));await nav('Clients',second);await expect(second.getByText('555-0109',{exact:false})).toBeVisible();await other.close();
 });
 test('uncertain expense save keeps one request through retry',async()=>{
  await nav('Daily');await add('Expense');await page.getByLabel('Description',{exact:true}).fill('Lost response purchase');await page.getByLabel('Amount ($)').fill('8');let requests=0;await page.route('**/api/v1/commands',async route=>{requests++;const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort();},{times:1});await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('button',{name:'Retry same save'})).toBeVisible();await page.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.getByRole('dialog',{name:'Add purchase',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Retry same save'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(requests).toBe(1);expect((await snapshot()).expenses.filter(e=>e.description==='Lost response purchase')).toHaveLength(1);
 });
 test('Escape closes the Add menu and restores focus to the Add button',async()=>{
  const add=page.locator('.add-button');await add.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog',{name:'Add',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(add).toBeFocused();
 });
 test('phone and desktop layouts fit, private export works, sign-out removes business state',async()=>{
  await nav('Daily');await mkdir('artifacts/screenshots',{recursive:true});
  for(const [width,height] of [[320,844],[390,844],[768,1024],[1280,900]]){
   await page.setViewportSize({width,height});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.content-viewport').evaluate(el=>el.scrollTop=el.scrollHeight);
   const add=page.locator('.add-button');await expect(add).toBeVisible();const addBox=(await add.boundingBox())!;
   expect(addBox.width).toBeGreaterThanOrEqual(44);expect(addBox.height).toBeGreaterThanOrEqual(44);expect(addBox.x).toBeGreaterThanOrEqual(0);expect(addBox.x+addBox.width).toBeLessThanOrEqual(width);expect(addBox.y+addBox.height).toBeLessThanOrEqual(height);
   if(width<1100){const navigation=page.getByRole('navigation',{name:'Main navigation',exact:true});await expect(navigation).toBeVisible();const navBox=(await navigation.boundingBox())!;expect(addBox.y+addBox.height).toBeLessThanOrEqual(navBox.y);}
   else {const navigation=page.getByRole('navigation',{name:'Workspace sections',exact:true});await expect(navigation).toBeVisible();const navBox=(await navigation.boundingBox())!;expect(navBox.x+navBox.width).toBeLessThanOrEqual(addBox.x);}
   await page.locator('.content-viewport').evaluate(el=>el.scrollTop=0);if(width===390||width===1280)await page.screenshot({path:'artifacts/screenshots/live-daily-'+(width===390?'phone':'desktop')+'.png'});
  }
  await nav('More');const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download business export'}).click();expect((await download).suggestedFilename()).toBe('pirata-business-v2.json');expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(original);await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByLabel('Pirata password')).toBeVisible();await expect(page.getByText('Smith exterior painting',{exact:true})).toHaveCount(0);expect(await page.evaluate(async()=>(await fetch('/api/v1/snapshot')).status)).toBe(401);
 });
});

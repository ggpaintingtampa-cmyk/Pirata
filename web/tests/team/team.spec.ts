import {expect,test,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const engine=process.env.PIRATA_TEST_WEBKIT?'webkit':'chromium';
const password='isolated-team-browser-password';
async function login(page:Page,username='owner'){await page.goto('/');await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Pirata password').fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Work.',exact:true})).toBeVisible();}
async function menu(page:Page,name:string){await page.getByRole('navigation').getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();}
async function snapshot(page:Page){return page.evaluate(async()=> (await fetch('/api/v1/snapshot')).json());}
async function command(page:Page,command:unknown){return page.evaluate(async command=>{const session=await(await fetch('/api/v1/session')).json(),snap=await(await fetch('/api/v1/snapshot')).json();const r=await fetch('/api/v1/commands',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({requestId:crypto.randomUUID(),baseRevision:snap.revision,command})});if(!r.ok)throw new Error(await r.text());return r.json();},command);}
test('team workflow, progress, calendar, Add context, live updates and private settings',async({page,browser,baseURL})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await login(page);await expect(page.getByText('Choose a few meaningful goals to begin your day.')).toBeVisible();
 await menu(page,'Team accounts');await page.getByLabel('Name',{exact:true}).fill('Painter');await page.getByLabel('Username',{exact:true}).fill('painter');await page.getByLabel('Password (at least 15 characters)',{exact:true}).fill(password);await page.getByRole('button',{name:'Create employee',exact:true}).click();await expect(page.getByText('painter · employee',{exact:true})).toBeVisible();
 await page.getByRole('navigation').getByRole('button',{name:'Work',exact:true}).click();await page.locator('.action-bar').getByRole('button',{name:'Add task',exact:true}).click();await expect(page.getByRole('dialog',{name:'Add task',exact:true})).toBeVisible();await page.getByLabel('Task title',{exact:true}).fill('Paint doors');await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);let s=await snapshot(page);const parent=s.tasks.find((t:{title:string})=>t.title==='Paint doors');expect(parent.estimatedMinutes).toBe(0);
 await menu(page,'All tasks');await page.getByRole('button',{name:'Open task: Paint doors',exact:true}).click();await page.getByRole('dialog').getByText('Add subtasks quickly',{exact:true}).click();await page.getByLabel('Subtask names — one per line').fill('Prep, mask and clean doors\nSpray paint the doors');await page.getByRole('dialog').getByRole('button',{name:'Save and add another'}).click();await expect(page.getByRole('button',{name:'Prep, mask and clean doors',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 const second=(await command(page,{type:'task.create',title:'Finish trim'})).result.id;await command(page,{type:'task.batchCreate',titles:['Prep trim','Paint trim'],projectId:null,parentTaskId:second,assigneeId:null});s=await snapshot(page);await command(page,{type:'dailyGoal.replace',date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.serverNow)),userId:s.currentUser.id,taskIds:[parent.id,second]});await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Work',exact:true}).click();await page.reload();await expect(page.getByRole('progressbar',{name:'Daily completion',exact:true})).toHaveAttribute('aria-valuenow','0');await command(page,{type:'task.setStatus',id:s.tasks.find((t:{title:string})=>t.title==='Prep, mask and clean doors').id,status:'done',expectedSessionId:null});await page.reload();await expect(page.getByRole('progressbar',{name:'Daily completion',exact:true})).toHaveAttribute('aria-valuenow','25');
 const client=(await command(page,{type:'client.create',name:'Team client',phone:'',email:'',note:''})).result.id;const project=(await command(page,{type:'project.create',name:'Team project',clientId:client,clientName:'',address:'',note:''})).result.id;await command(page,{type:'task.update',id:parent.id,title:'Paint doors',projectId:project,estimatedMinutes:0,note:''});await page.reload();await menu(page,'Projects');await page.getByRole('button',{name:'View project: Team project',exact:true}).click();await page.locator('.action-bar').getByRole('button',{name:'Add task',exact:true}).click();await expect(page.getByLabel('Project (optional)',{exact:true})).toHaveValue(project);await page.getByRole('button',{name:'Back to Add menu'}).click();await expect(page.getByRole('dialog',{name:'Quick Add'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 const worker=await browser.newContext({baseURL,ignoreHTTPSErrors:true,timezoneId:'America/New_York',viewport:{width:390,height:844}}),other=await worker.newPage();await login(other,'painter');await other.getByRole('navigation').getByRole('button',{name:'Menu',exact:true}).click();await expect(other.getByRole('button',{name:'Spending',exact:true})).toHaveCount(0);expect(await other.evaluate(async()=>(await fetch('/api/v1/admin/team')).status)).toBe(403);await other.getByRole('navigation').getByRole('button',{name:'Updates',exact:true}).click();await command(page,{type:'update.post',projectId:project,taskId:null,body:'Shared crew update'});await expect(other.getByText('Shared crew update',{exact:true})).toBeVisible({timeout:12000});
 await menu(page,'Calendar');for(const name of ['Time grid','Day','Week','Month']){const button=page.getByRole('group',{name:'Calendar view',exact:true}).getByRole('button',{name,exact:true});await button.click();await expect(button).toHaveAttribute('aria-pressed','true');}await mkdir('artifacts/screenshots',{recursive:true});for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:width>=768?960:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/screenshots/team-calendar-'+engine+'-'+width+'.png',fullPage:true});}
 await page.setViewportSize({width:390,height:844}); await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Ask',exact:true}).click();await expect(page.locator('.ask-configuration')).toBeVisible();await expect(page.locator('.ask-configuration')).toContainText('The rest of the app is ready to use.');await expect(page.locator('.ask-view').getByRole('button',{name:'Ask',exact:true})).toBeDisabled();expect(errors).toEqual([]);await worker.close();
});

test('blocking a parent preserves its child timer and finishing saves the interval once',async({page})=>{
 await login(page);
 const title='Parent timer review '+Date.now();
 const parentId=(await command(page,{type:'task.create',title})).result.id;
 const childId=(await command(page,{type:'task.create',title:title+' child',parentTaskId:parentId})).result.id;
 await command(page,{type:'timer.start',taskId:childId});
 const sessionId=(await snapshot(page)).runningTimer.sessionId;
 await page.reload();await menu(page,'All tasks');
 const openParent=async()=>{await page.getByRole('button',{name:'Open task: '+title,exact:true}).click();};
 await openParent();await page.getByRole('dialog').getByText('More task actions',{exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Block task',exact:true}).click();
 await page.getByRole('dialog',{name:'Block task',exact:true}).getByRole('button',{name:'Confirm block task',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 let state=await snapshot(page);
 expect(state.tasks.find((task:{id:string})=>task.id===parentId).status).toBe('blocked');
 expect(state.runningTimer.sessionId).toBe(sessionId);
 expect(state.runningTimer.taskId).toBe(childId);
 expect(state.timeEntries.filter((entry:{id:string})=>entry.id===sessionId)).toHaveLength(0);
 await openParent();await page.getByRole('dialog').getByRole('button',{name:'Reopen task',exact:true}).click();
 await page.getByRole('dialog',{name:'Reopen task',exact:true}).getByRole('button',{name:'Confirm reopen task',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await openParent();await page.getByRole('dialog').getByRole('button',{name:'Finish task',exact:true}).click();
 await page.getByRole('dialog',{name:'Finish task',exact:true}).getByRole('button',{name:'Confirm finish task',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 state=await snapshot(page);
 expect(state.runningTimer).toBeNull();
 expect(state.tasks.find((task:{id:string})=>task.id===parentId).status).toBe('done');
 expect(state.tasks.find((task:{id:string})=>task.id===childId).status).toBe('done');
 expect(state.timeEntries.filter((entry:{id:string})=>entry.id===sessionId)).toHaveLength(1);
});

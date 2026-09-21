import { test, expect, open, command, snapshot, stopTimer } from './helpers';

test('name-only capture, multiline subtasks and equal daily goals work through controls',async({page})=>{
  await open(page);await stopTimer(page);
  await page.getByRole('button',{name:'Add task',exact:true}).click();await page.getByLabel('Task title').fill('Two door goal');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const state=await snapshot(page),parent=state.tasks.find(task=>task.title==='Two door goal')!;expect(parent.estimatedMinutes).toBe(0);
  const other=(await command(page,{type:'task.create',title:'Second daily goal',estimatedMinutes:0,projectId:null,note:''})).result.id!;
  await command(page,{type:'task.batchCreate',titles:['Mask second','Paint second'],projectId:null,parentTaskId:other,assigneeId:null});
  await command(page,{type:'timer.start',taskId:parent.id});await open(page,'WorkView');
  await page.getByText('Add subtasks quickly',{exact:true}).click();await page.getByLabel('Subtask names — one per line').fill('Mask first\nPaint first');await page.getByRole('button',{name:'Save and add another',exact:true}).first().click();await expect(page.getByLabel('Subtask names — one per line')).toHaveValue('');
  await page.getByRole('button',{name:'Choose daily goals',exact:true}).click();await page.getByLabel('Goal 1',{exact:true}).selectOption(parent.id);await page.getByLabel('Goal 2',{exact:true}).selectOption(other);await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Complete Mask first',exact:true}).click();await expect(page.getByRole('progressbar',{name:'Daily completion',exact:true})).toHaveAttribute('aria-valuenow','25');
  await page.getByRole('button',{name:'Complete Two door goal',exact:true}).click();await page.getByRole('button',{name:'Complete task and remaining subtasks'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('progressbar',{name:'Daily completion',exact:true})).toHaveAttribute('aria-valuenow','50');expect((await snapshot(page)).runningTimer).toBeNull();
});

test('Work and calendar layouts fit phones, tablet and desktop with clear person filtering',async({page})=>{
  await open(page);await stopTimer(page);
  const state=await snapshot(page),ownerId=state.currentUser!.id;
  const parent=(await command(page,{type:'task.create',title:'Prepare front doors',estimatedMinutes:0,projectId:null,note:'',assigneeId:ownerId})).result.id!;
  await command(page,{type:'task.batchCreate',titles:['Mask and clean','Spray doors'],projectId:null,parentTaskId:parent,assigneeId:null});
  await command(page,{type:'schedule.setTaskBlock',taskId:parent,block:{date:'2026-10-05',startMinute:540,endMinute:630,allowOverlap:true}});
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});await open(page,'WorkView');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`tests/modules/tasks-time/artifacts/team-work-${width}.png`,fullPage:true});
    await open(page,'CalendarView');await page.getByLabel('Calendar date',{exact:true}).fill('2026-10-05');await page.getByRole('button',{name:'Time grid',exact:true}).click();await expect(page.getByRole('button',{name:/Prepare front doors, Owner, 09:00/}).filter({visible:true})).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`tests/modules/tasks-time/artifacts/calendar-hours-${width}.png`,fullPage:true});
    await page.getByRole('group',{name:'Filter by team'}).getByText('Owner',{exact:true}).click();await expect(page.getByLabel('Owner',{exact:true})).not.toBeChecked();await expect(page.getByRole('button',{name:/Prepare front doors, Owner, 09:00/}).filter({visible:true})).toHaveCount(0);await page.getByRole('button',{name:'Everyone',exact:true}).click();await expect(page.getByLabel('Owner',{exact:true})).toBeChecked();
    for(const mode of ['Day','Week','Month']){await page.getByRole('button',{name:mode,exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(mode==='Month')await page.screenshot({path:`tests/modules/tasks-time/artifacts/calendar-month-${width}.png`,fullPage:true});}
  }
});

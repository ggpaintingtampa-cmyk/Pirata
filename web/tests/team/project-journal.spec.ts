import { expect, test, type Page } from '@playwright/test';
import { businessDate } from '@pirata/domain/lib/dates';
import type { BusinessCommand, BusinessSnapshot } from '@pirata/contracts/index';

async function snapshot(page:Page):Promise<BusinessSnapshot>{return page.evaluate(async()=>(await fetch('/api/v1/snapshot')).json());}
async function command(page:Page,command:BusinessCommand){
  return page.evaluate(async command=>{
    const session=await(await fetch('/api/v1/session')).json(),state=await(await fetch('/api/v1/snapshot')).json();
    const response=await fetch('/api/v1/commands',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({requestId:crypto.randomUUID(),baseRevision:state.revision,command})});
    if(!response.ok)throw Error(await response.text());
    return response.json();
  },command);
}

test('project journals save through Add and the project page, reopen by date, edit and stay with their project',async({page})=>{
  await page.goto('/');
  await page.getByLabel('Username',{exact:true}).fill('owner');
  await page.getByLabel('Pirata password').fill('isolated-team-browser-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Daily.',exact:true})).toBeVisible();
  const clientId=(await command(page,{type:'client.create',name:'Journal test client',phone:'',email:'',note:''})).result.id;
  const create=async(name:string)=>(await command(page,{type:'project.create',name,clientId,clientName:'',address:'',note:''})).result.id as string;
  const projectId=await create('Synthetic journal project'),otherId=await create('Other journal project');
  await command(page,{type:'note.save',projectId,title:'Paint reference',body:'An existing regular note',pinned:false,product:'',color:'',colorCode:'',finish:'',quantity:'',store:'',labelAttachmentId:null});
  await page.reload();
  await page.locator('.add-button').click();
  await page.getByRole('button',{name:/Project journal Write a dated entry/}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Save entry',exact:true}).click();
  await expect(dialog.getByText('Write a journal entry.',{exact:true})).toBeVisible();
  await dialog.getByRole('combobox',{name:'Project',exact:true}).selectOption(projectId);
  await dialog.getByRole('textbox',{name:'Journal entry',exact:true}).fill('First visit.\nPrepared the walls and protected the floors.');
  await dialog.getByRole('button',{name:'Save entry',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  let state=await snapshot(page);
  const saved=state.projectNotes!.find(entry=>entry.noteKind==='journal')!,date=businessDate(saved.createdAt);
  expect(saved.projectId).toBe(projectId);
  await page.goto('/#/project/'+projectId);
  const panel=page.getByRole('region',{name:'Project journal',exact:true});
  await expect(page.locator('.cp-project-detail > .cp-project-section').last()).toHaveClass(/project-journal/);
  await expect(panel.getByRole('button',{name:date,exact:true})).toBeVisible();
  await expect(page.locator('.co-notes-list')).toContainText('An existing regular note');
  await expect(page.locator('.co-notes-list')).not.toContainText('First visit.');
  await panel.getByRole('button',{name:date,exact:true}).click();
  await expect(dialog).toContainText('Prepared the walls and protected the floors.');
  await dialog.getByRole('button',{name:'Edit entry',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Journal entry',exact:true}).fill('Updated visit notes.\nReady for primer.');
  await dialog.getByRole('button',{name:'Save entry',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Add journal entry',exact:true}).first().click();
  await expect(dialog).toContainText('Synthetic journal project');
  await dialog.getByRole('textbox',{name:'Journal entry',exact:true}).fill('Second entry on the same day.');
  await dialog.getByRole('button',{name:'Save entry',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.locator('.journal-entries button')).toHaveCount(2);
  state=await snapshot(page);
  expect(state.projectNotes!.find(entry=>entry.id===saved.id)).toMatchObject({body:'Updated visit notes.\nReady for primer.',createdAt:saved.createdAt,projectId});
  await command(page,{type:'user.setLocale',locale:'es'});
  await page.reload();
  const spanishPanel=page.getByRole('region',{name:'Diario del proyecto',exact:true});
  await spanishPanel.scrollIntoViewIfNeeded();
  await expect(spanishPanel.locator('.journal-entries button')).toHaveCount(2);
  const button=spanishPanel.locator('.journal-entries button').first();
  await expect(button).toHaveText(date);
  await expect(button).toHaveCSS('justify-content','center');
  await page.screenshot({path:test.info().outputPath('journal-spanish-phone.png')});
  await button.click();
  await expect(dialog.getByRole('button',{name:'Editar entrada',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.goto('/#/project/'+otherId);
  await expect(page.getByText('Aún no hay entradas en el diario.',{exact:true})).toBeVisible();
  await command(page,{type:'user.setLocale',locale:'en'});
});

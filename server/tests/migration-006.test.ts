import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { setOwnerPassword } from '../src/auth/password.js';
import { Repositories } from '../src/core/repositories.js';
import { migrate, migrations, openDatabase } from '../src/db/database.js';

it('migration 006 preserves every existing project-note value and defaults it to a regular note', async () => {
  const directory = mkdtempSync(join(tmpdir(),'pirata-journal-migration-'));
  const db = openDatabase(join(directory,'business.sqlite'),{create:true,applyMigrations:false});
  try {
    migrate(db,migrations().slice(0,5));
    const now = Date.parse('2026-10-02T02:00:00Z');
    const owner = await setOwnerPassword(db,'Synthetic journal migration password','setup',now);
    const repo = new Repositories(db,owner);
    const base = {createdAt:now,updatedAt:now};
    repo.insert('projects',{...base,id:'p',name:'Synthetic project',clientId:null,clientName:'',address:'',note:'',status:'draft'});
    repo.insert('project_notes',{...base,id:'n',projectId:'p',title:'Existing paint note',body:'Keep this exactly.\nSecond line.',pinned:1,product:'Paint',color:'White',colorCode:'1',finish:'Satin',quantity:'2',store:'Shop',labelAttachmentId:null,createdBy:owner});
    const before = repo.require('project_notes','n');
    migrate(db);
    expect(repo.require('project_notes','n')).toEqual({...before,noteKind:'note'});
    expect(db.prepare('SELECT max(version) v FROM schema_versions').get()).toEqual({v:6});
    expect(db.pragma('foreign_key_check')).toEqual([]);
    migrate(db);
    expect(repo.require('project_notes','n')).toEqual({...before,noteKind:'note'});
  } finally {db.close();rmSync(directory,{recursive:true,force:true});}
});

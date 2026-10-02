import { afterEach, beforeEach, expect, it } from 'vitest';
import { moduleFixture, project, NOW, type ModuleFixture } from './modules/spending/support.js';
import { snapshotSchema } from '@pirata/contracts/index';
let f: ModuleFixture;
beforeEach(async () => { f = await moduleFixture(); });
afterEach(async () => { await f.close(); });

it('saves separate same-day entries and retries without duplicating; snapshots include journal text', async () => {
  const projectId = (await f.save(project())).result.id!;
  const first = await f.send({ type:'journal.save', projectId, body:'First visit.\nWalls prepared.' });
  expect(first.response.statusCode).toBe(200);
  expect((await f.request(first.envelope)).statusCode).toBe(200);
  await f.save({ type:'journal.save', projectId, body:'Second visit.' });
  const notes = f.repo.list('project_notes');
  expect(notes).toHaveLength(2);
  expect(notes.find(entry=>entry.id===first.response.json().result.id)).toMatchObject({ projectId, noteKind:'journal', createdBy:f.ownerId, createdAt:NOW, title:'2026-09-17', body:'First visit.\nWalls prepared.', pinned:0 });
  expect(snapshotSchema.parse(await f.snapshot()).projectNotes).toHaveLength(2);
});

it('edits text without changing the original date, project or author', async () => {
  const projectId = (await f.save(project())).result.id!;
  const id = (await f.save({ type:'journal.save', projectId, body:'Before' })).result.id!;
  const before = f.repo.require('project_notes', id);
  f.tick(86400000);
  await f.save({ type:'journal.save', id, projectId, body:'After' });
  expect(f.repo.require('project_notes', id)).toEqual({ ...before, body:'After', updatedAt:NOW+86400000 });
  expect((await f.save({ type:'journal.save', id, projectId, body:'After' })).changed).toBe(false);
});

it('rejects empty text, missing projects, moving entries and converting regular notes', async () => {
  const projectId = (await f.save(project())).result.id!, otherId = (await f.save(project('Other'))).result.id!;
  expect((await f.send({ type:'journal.save', projectId, body:'   ' })).response.statusCode).toBe(400);
  expect((await f.send({ type:'journal.save', projectId:'missing', body:'Text' })).response.statusCode).toBe(404);
  const id = (await f.save({ type:'journal.save', projectId, body:'Text' })).result.id!;
  expect((await f.send({ type:'journal.save', id, projectId:otherId, body:'Wrong project' })).response.statusCode).toBe(400);
  const regular = { type:'note.save' as const, projectId, title:'Paint', body:'White', pinned:false, product:'', color:'', colorCode:'', finish:'', quantity:'', store:'', labelAttachmentId:null };
  const noteId = (await f.save(regular)).result.id!;
  expect((await f.send({ type:'journal.save', id:noteId, projectId, body:'Convert' })).response.statusCode).toBe(400);
  expect((await f.send({ ...regular, id })).response.statusCode).toBe(400);
});

it('uses the project business date near UTC midnight', async () => {
  const projectId = (await f.save(project())).result.id!;
  f.tick(Date.parse('2026-09-18T02:00:00Z') - NOW);
  const id = (await f.save({ type:'journal.save', projectId, body:'Evening visit' })).result.id!;
  expect(f.repo.require('project_notes', id).title).toBe('2026-09-17');
});

it('restores journals with their deleted project, including text and original creation date', async () => {
  const projectId = (await f.save(project())).result.id!;
  const id = (await f.save({ type:'journal.save', projectId, body:'Keep this entry through a project restore.' })).result.id!;
  const before = f.repo.require('project_notes',id);
  await f.save({ type:'record.delete',kind:'project',id:projectId });
  expect((await f.snapshot()).projectNotes).toHaveLength(0);
  await f.save({ type:'record.restore',kind:'project',id:projectId });
  expect((await f.snapshot()).projectNotes).toContainEqual(before);
});

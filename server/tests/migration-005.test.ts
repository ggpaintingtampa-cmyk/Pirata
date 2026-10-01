// Update 2026-09-29: migration 005 is additive, readable through the strict snapshot schema, and covered by the reset tooling.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { snapshotSchema } from '@pirata/contracts/index';
import { setOwnerPassword } from '../src/auth/password.js';
import { Repositories, TABLES } from '../src/core/repositories.js';
import { readSnapshot } from '../src/core/snapshot.js';
import { migrate, migrations, openDatabase, type Sqlite } from '../src/db/database.js';
import { PRESERVED_TABLES, RESET_TABLES } from '../src/db/reset.js';
import { capabilities } from '../src/modules/index.js';
const NOW = 1_790_000_000_000;
let directory: string; let db: Sqlite;
afterEach(() => { if (db?.open) db.close(); if (directory) rmSync(directory, { recursive: true, force: true }); });

describe('migration 005', () => {
  it('upgrades a schema-004 database in place, keeps every old row and gives templates a version', async () => {
    directory = mkdtempSync(join(tmpdir(), 'pirata-005-'));
    const path = join(directory, 'business.sqlite');
    const steps = migrations();
    expect(steps).toHaveLength(5);
    db = openDatabase(path, { create: true, applyMigrations: false });
    migrate(db, steps.slice(0, 4));
    const ownerId = await setOwnerPassword(db, 'Isolated schema fixture password', 'setup', NOW);
    const repo = new Repositories(db, ownerId);
    db.prepare('INSERT INTO task_templates (id,owner_id,created_at,updated_at,name,titles,tree) VALUES (?,?,?,?,?,?,?)').run('tpl', ownerId, NOW, NOW, 'Prepare wall', JSON.stringify(['Patch', 'Sand']), JSON.stringify([{ title: 'Patch', description: '', children: [] }]));
    db.prepare('INSERT INTO project_templates (id,owner_id,created_at,updated_at,name,note,tree,created_by) VALUES (?,?,?,?,?,?,?,?)').run('ptpl', ownerId, NOW, NOW, 'Interior', '', JSON.stringify([{ title: 'Prep', description: '', children: [] }]), ownerId);
    db.prepare("INSERT INTO ai_usage (id,owner_id,user_id,created_at,status,reserved_cents) VALUES ('u1',?,?,?,'complete',3)").run(ownerId, ownerId, NOW);
    migrate(db);
    expect(db.prepare('SELECT max(version) v FROM schema_versions').get()).toEqual({ v: 5 });
    expect(repo.require('task_templates', 'tpl')).toMatchObject({ name: 'Prepare wall', version: 1 });
    expect(repo.require('project_templates', 'ptpl')).toMatchObject({ name: 'Interior', version: 1 });
    expect(db.prepare("SELECT kind FROM ai_usage WHERE id='u1'").get()).toEqual({ kind: 'ask' });
    const snapshot = readSnapshot(db, ownerId, capabilities, NOW, ownerId, 'owner');
    expect(() => snapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.translationEpoch).toBe(0);
    expect(snapshot.taskRequirements).toEqual([]);
    expect(snapshot.translationGlossary).toEqual([]);
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
    for (const table of ['translations', 'translation_source_locales', 'translation_glossary', 'translation_settings', 'task_requirements', 'batch_operations', 'integration_tokens']) expect(names).toContain(table);
  });
  it('lists every business table in exactly one reset bucket so the operator reset keeps working', () => {
    directory = mkdtempSync(join(tmpdir(), 'pirata-005-reset-'));
    db = openDatabase(join(directory, 'business.sqlite'), { create: true });
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map(r => r.name).sort();
    const buckets = [...RESET_TABLES, ...PRESERVED_TABLES, 'data_revisions', 'ai_usage'].sort();
    expect(names).toEqual(buckets);
    expect(new Set(buckets).size).toBe(buckets.length);
    for (const table of TABLES) expect(buckets).toContain(table);
  });
});

"""Isolated migration preservation and pre-open recovery tests; no host services."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import types
import unittest
from unittest.mock import patch

from backup import publish_files
import release

spec = importlib.util.spec_from_file_location('publish_team', Path(__file__).with_name('publish-team.py'))
team = importlib.util.module_from_spec(spec)
spec.loader.exec_module(team)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pirata-team-release-test-')
        self.base = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def database(self, name):
        path = self.base / name
        with sqlite3.connect(path) as db:
            db.executescript("CREATE TABLE tasks(id TEXT PRIMARY KEY, owner_id TEXT, title TEXT); INSERT INTO tasks VALUES('existing-task','same-business','Keep historical value');")
        path.chmod(0o600)
        return path

    def test_additive_columns_preserve_all_historical_values(self):
        original = self.database('original.sqlite')
        migrated = self.base / 'migrated.sqlite'
        shutil.copyfile(original, migrated)
        with sqlite3.connect(migrated) as db:
            db.execute('ALTER TABLE tasks ADD COLUMN assignee_id TEXT')
            db.execute("UPDATE tasks SET assignee_id='same-business'")
        self.assertEqual(team.verify_preserved(original, migrated), {'tasks': 1})
        with sqlite3.connect(migrated) as db:
            db.execute("UPDATE tasks SET owner_id='wrong-business'")
        with self.assertRaisesRegex(ValueError, 'historical records'):
            team.verify_preserved(original, migrated)

    def test_historical_migration_change_refused(self):
        old, new = self.base / 'old', self.base / 'new'
        for folder in [old, new]:
            (folder / 'src/db/migrations').mkdir(parents=True)
            (folder / 'src/db/migrations/001-original.sql').write_text('original')
        (new / 'src/db/migrations/002-next.sql').write_text('next')
        self.assertEqual(len(team.validate_migration_history(old, new)), 2)
        (new / 'src/db/migrations/001-original.sql').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'unchanged'):
            team.validate_migration_history(old, new)

    def test_database_move_preserves_wal_sidecars(self):
        before, after = self.base / 'live.sqlite', self.base / 'saved.sqlite'
        for suffix in ['', '-wal', '-shm']:
            Path(str(before) + suffix).write_bytes(suffix.encode())
        team.move_database(before, after)
        for suffix in ['', '-wal', '-shm']:
            self.assertFalse(Path(str(before) + suffix).exists())
            self.assertEqual(Path(str(after) + suffix).read_bytes(), suffix.encode())
        team.move_database(after, before)
        self.assertTrue(before.exists())

    def test_service_start_failure_restores_previous_pair_and_original_db(self):
        self.exercise_release_failure('before-open')

    def test_after_open_failure_preserves_new_database_and_releases(self):
        self.exercise_release_failure('after-open')

    def exercise_release_failure(self, phase):
        # A simulated service fault runs the actual migration/staging/publish
        # orchestration. Only host service/network/privilege adapters are mocked.
        root, backups, state = self.base / 'srv', self.base / 'backups', self.base / 'state'
        root.mkdir(mode=0o755); backups.mkdir(mode=0o700); state.mkdir(mode=0o700)
        (root / 'api-releases/old').mkdir(parents=True)
        old = root / 'api-releases/old'
        for folder in [old, self.base / 'candidate']:
            (folder / 'src/db/migrations').mkdir(parents=True)
            (folder / 'src/db/migrations/001-original.sql').write_text('original')
            (folder / 'dist').mkdir()
            for name in ['main.js', 'cli.js']:
                (folder / 'dist' / name).write_text('// fixture')
        (root / 'api-current').symlink_to('api-releases/old')
        (root / 'runtime').mkdir(); (root / 'runtime/node').write_text('fixture')
        (root / 'operations').mkdir(); (root / 'operations/backup.py').write_text('old-backup')
        source = self.base / 'source'; source.mkdir()
        (source / 'backup.py').write_text('new-backup')
        (source / 'pirata-api.service').write_text('new-unit')
        (source / 'Caddyfile.team.example').write_text('new-site')
        site, unit, config = self.base / 'pirata.caddy', self.base / 'pirata-api.service', self.base / 'Caddyfile'
        site.write_text('old-site'); unit.write_text('old-unit'); config.write_text('shared-config')
        db = self.database('original.sqlite')
        shutil.copyfile(db, state / 'pirata.sqlite'); (state / 'pirata.sqlite').chmod(0o600)
        dist = self.base / 'dist'; dist.mkdir(); (dist / 'assets').mkdir()
        (dist / 'index.html').write_text('<title>Morgan el Pirata</title><script src="./assets/index-AAAAAA.js"></script><link href="./assets/index-AAAAAA.css">')
        (dist / 'favicon.svg').write_text('<svg/>')
        for ext in ['js', 'css']:
            (dist / 'assets' / ('index-AAAAAA.' + ext)).write_text('fixture')
        release.prepare(root, backups)
        previous_web = release.publish(dist, root, backups)['releaseId']
        commands = []
        def fake_run(args):
            commands.append(list(map(str, args)))
            if len(args) > 2 and str(args[2]) == 'restore':
                shutil.copyfile(args[3], args[4])
                Path(args[4]).chmod(0o600)
                with sqlite3.connect(args[4]) as connection:
                    connection.execute('ALTER TABLE tasks ADD COLUMN assignee_id TEXT')
        def fake_backup(paths, uid, gid):
            target = backups / 'before.sqlite'
            shutil.copyfile(state / 'pirata.sqlite', target); target.chmod(0o600)
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            publish_files(types.SimpleNamespace(uploads=state / 'uploads'), target, digest, uid)
            return target, digest
        real_copyfile = shutil.copyfile
        def copyfile(source_path, destination_path, **kwargs):
            if str(source_path) in ['/etc/caddy/Caddyfile', '/etc/caddy/pirata-access.caddy']:
                source_path = config
            return real_copyfile(source_path, destination_path, **kwargs)
        uid, gid = os.geteuid(), os.getegid()
        with contextlib.ExitStack() as stack:
            for name, value in [('ROOT', root), ('BACKUPS', backups), ('STATE', state), ('SITE', site), ('UNIT', unit), ('SOURCE', source)]:
                stack.enter_context(patch.object(team, name, value))
            for name, value in [('run', fake_run), ('status', lambda url, *args: 401 if 'research' in url else 503),
                                ('reload_caddy', lambda: None), ('validate_candidate', lambda _: None),
                                ('backup_once', fake_backup), ('health_and_protection', lambda: (_ for _ in ()).throw(ValueError('simulated health failure')) if phase == 'before-open' else None)]:
                stack.enter_context(patch.object(team, name, value))
            stack.enter_context(patch.object(team.os, 'geteuid', lambda: 0))
            stack.enter_context(patch.object(team.socket, 'gethostname', lambda: 'srv1972305'))
            stack.enter_context(patch.object(team.pwd, 'getpwnam', lambda _: types.SimpleNamespace(pw_uid=uid, pw_gid=gid)))
            stack.enter_context(patch.object(team.shutil, 'copyfile', copyfile))
            with self.assertRaisesRegex(ValueError, 'simulated health failure' if phase == 'before-open' else 'Public app/authentication'):
                team.main(self.base / 'candidate', dist)
        report = json.loads(next(backups.glob('team-upgrade-*/upgrade.json')).read_text())
        if phase == 'after-open':
            self.assertNotEqual((root / 'api-current').resolve(), old)
            self.assertNotEqual((root / 'current').resolve().name, previous_web)
            self.assertEqual(site.read_text(), 'new-site')
            self.assertTrue(report['status'].startswith('opened-needs-review'))
            with sqlite3.connect(state / 'pirata.sqlite') as current:
                self.assertIn('assignee_id', [row[1] for row in current.execute('PRAGMA table_info(tasks)')])
            self.assertTrue(next(state.glob('upgrade-recovery-*/previous.sqlite')).is_file())
            return
        self.assertEqual((root / 'api-current').resolve(), old)
        self.assertEqual((root / 'current').resolve().name, previous_web)
        self.assertEqual(team.verify_preserved(db, state / 'pirata.sqlite'), {'tasks': 1})
        self.assertEqual(site.read_text(), 'old-site')
        self.assertEqual(unit.read_text(), 'old-unit')
        self.assertEqual((root / 'operations/backup.py').read_text(), 'old-backup')
        self.assertTrue(report['status'].startswith('rolled-back-before-public-open'))
        self.assertIn(['systemctl', 'start', 'pirata-api.service'], commands)


if __name__ == '__main__':
    unittest.main()

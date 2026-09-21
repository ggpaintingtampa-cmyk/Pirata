"""Isolated checks: temporary DBs and actual bundled Node backup CLI, no services.

PIRATA_TEST_CLI may select another reviewed standalone CLI; defaults to candidate-2.
The runner deliberately stays under the test user's identity instead of runuser.
"""
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest

from backup import Paths, backup_once, bundle_paths, restore_bundle

NODE = Path('/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')
CLI = Path(os.environ.get('PIRATA_TEST_CLI', '/tmp/pirata-server-candidate-2/dist/cli.js'))


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pirata-backup-test-')
        root = Path(self.temp.name)
        state, backups = root / 'state', root / 'backups'
        state.mkdir(mode=0o700)
        backups.mkdir(mode=0o700)
        self.paths = Paths(state, backups, NODE, CLI)
        self.database = state / 'pirata.sqlite'
        self.cli('migrate')

    def tearDown(self):
        self.temp.cleanup()

    def cli(self, *args):
        subprocess.run([str(NODE), str(CLI), *map(str, args)], check=True,
                       env={'PATH': '/usr/bin:/bin', 'NODE_ENV': 'production',
                            'PIRATA_DB_PATH': str(self.database),
                            'PIRATA_ORIGIN': 'https://pirata.andresinbox.tech'},
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                       stderr=subprocess.PIPE)

    def owner_cli(self, paths, destination):
        self.assertEqual(paths, self.paths)
        self.cli('backup', destination)

    def run_backup(self, runner=None):
        return backup_once(self.paths, os.geteuid(), os.getegid(), runner or self.owner_cli)

    def seed(self, connection):
        connection.execute('INSERT INTO owners (id,password_hash,created_at,updated_at) VALUES (?,?,?,?)',
                           ('fixture-owner', 'not-a-real-credential', 1, 1))
        connection.commit()

    def assert_snapshot(self, final):
        db = sqlite3.connect(final.as_uri() + '?mode=ro&immutable=1', uri=True)
        try:
            self.assertEqual(db.execute('SELECT id FROM owners').fetchall(), [('fixture-owner',)])
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchall(), [('ok',)])
        finally:
            db.close()
        self.assertEqual(final.stat().st_mode & 0o777, 0o600)
        self.assertEqual(final.stat().st_uid, os.geteuid())
        self.assertEqual(list((self.paths.state / 'backup-staging').iterdir()), [])
        self.assertEqual(list(final.parent.glob('.pending-*')), [])
        self.assertFalse(Path(str(final) + '-wal').exists())
        files, manifest = bundle_paths(final)
        self.assertTrue(files.is_dir())
        self.assertTrue(manifest.is_file())

    def assert_no_publication(self):
        self.assertEqual(list((self.paths.backups / 'database').iterdir()), [])
        self.assertEqual(list((self.paths.state / 'backup-staging').iterdir()), [])

    def test_committed_live_wal_is_included(self):
        writer = sqlite3.connect(self.database)
        try:
            writer.execute('PRAGMA wal_autocheckpoint=0')
            self.seed(writer)
            self.assertGreater(Path(str(self.database) + '-wal').stat().st_size, 0)
            final, digest = self.run_backup()
            self.assertEqual(len(digest), 64)
            self.assert_snapshot(final)
        finally:
            writer.close()

    def test_stopped_api_without_sidecars_and_repeated_backup(self):
        writer = sqlite3.connect(self.database)
        self.seed(writer)
        writer.close()
        self.assertFalse(Path(str(self.database) + '-wal').exists())
        self.assertFalse(Path(str(self.database) + '-shm').exists())
        first, _ = self.run_backup()
        second, _ = self.run_backup()
        self.assertNotEqual(first, second)
        self.assert_snapshot(first)
        self.assert_snapshot(second)

    def test_corrupt_copy_is_never_published(self):
        def corrupt(_paths, destination):
            destination.write_bytes(b'not a sqlite database')
            destination.chmod(0o600)
        with self.assertRaises(sqlite3.DatabaseError):
            self.run_backup(corrupt)
        self.assert_no_publication()

    def test_runner_failure_cleans_partial_staging(self):
        def fail(_paths, destination):
            destination.write_bytes(b'partial')
            raise RuntimeError('simulated CLI failure')
        with self.assertRaises(RuntimeError):
            self.run_backup(fail)
        self.assert_no_publication()

    def test_uncheckpointed_backup_sidecar_is_rejected(self):
        def sidecar(paths, destination):
            self.owner_cli(paths, destination)
            Path(str(destination) + '-wal').write_bytes(b'unexpected WAL')
        with self.assertRaisesRegex(ValueError, 'journal sidecar'):
            self.run_backup(sidecar)
        self.assert_no_publication()

    def test_symlink_cannot_substitute_live_database(self):
        original = self.database.read_bytes()
        def symlink(_paths, destination):
            destination.symlink_to(self.database)
        with self.assertRaises(OSError):
            self.run_backup(symlink)
        self.assertEqual(self.database.read_bytes(), original)
        self.assert_no_publication()

    def add_attachment(self, key='example/photo.jpg', preview='example/preview.jpg'):
        with sqlite3.connect(self.database) as db:
            # Preserve the real team's FK target shape when the selected CLI has
            # migration 002; an old CLI fixture only needs the storage contract.
            columns = [row[1] for row in db.execute('PRAGMA table_info(attachments)')]
            if 'owner_id' in columns:
                self.seed(db)
                db.execute('INSERT INTO attachments (id,owner_id,created_at,updated_at,parent_type,parent_id,name,mime_type,size,storage_key,preview_key,removed_at,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                           ('fixture-file', 'fixture-owner', 1, 1, 'task', 'fixture-task', 'photo.jpg', 'image/jpeg', 1, key, preview, None, 'fixture-owner'))
            else:
                db.execute('CREATE TABLE attachments (storage_key TEXT NOT NULL, preview_key TEXT)')
                db.execute('INSERT INTO attachments VALUES (?,?)', (key, preview))
        self.paths.uploads.mkdir(mode=0o700)
        (self.paths.uploads / 'example').mkdir(mode=0o700)
        for name in [key, preview]:
            if name:
                (self.paths.uploads / name).write_bytes(b'private fixture image ' + name.encode())
                (self.paths.uploads / name).chmod(0o600)

    def test_files_and_previews_restore_with_database(self):
        self.add_attachment()
        final, _ = self.run_backup()
        restored = self.paths.backups / 'scratch-restore'
        record = restore_bundle(final, restored)
        self.assertEqual(len(record['files']), 2)
        for key in record['files']:
            self.assertEqual((restored / 'uploads' / key).read_bytes(), (self.paths.uploads / key).read_bytes())
        self.assertTrue((restored / 'pirata.sqlite').is_file())
        with self.assertRaisesRegex(ValueError, 'new scratch'):
            restore_bundle(final, restored)

    def test_missing_referenced_file_refuses_complete_backup(self):
        self.add_attachment()
        (self.paths.uploads / 'example/photo.jpg').unlink()
        with self.assertRaises(FileNotFoundError):
            self.run_backup()
        self.assert_no_publication()

    def test_tampered_upload_refuses_restore_and_removes_scratch(self):
        self.add_attachment()
        final, _ = self.run_backup()
        files, _ = bundle_paths(final)
        (files / 'example/photo.jpg').write_bytes(b'changed')
        restored = self.paths.backups / 'scratch-restore'
        with self.assertRaisesRegex(ValueError, 'checksum'):
            restore_bundle(final, restored)
        self.assertFalse(restored.exists())

    def test_upload_symlink_refuses_backup(self):
        self.add_attachment()
        photo = self.paths.uploads / 'example/photo.jpg'
        photo.unlink()
        photo.symlink_to(self.paths.uploads / 'example/preview.jpg')
        with self.assertRaisesRegex(ValueError, 'links'):
            self.run_backup()
        self.assert_no_publication()


if __name__ == '__main__':
    unittest.main()

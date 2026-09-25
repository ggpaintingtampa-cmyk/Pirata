import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).with_name('release.py')
spec = importlib.util.spec_from_file_location('release', SOURCE)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.root = self.base / 'production'
        self.backups = self.base / 'backups'
        self.dist = self.base / 'dist'
        self.dist.mkdir()
        (self.dist / 'assets').mkdir()
        self.build('AAAAAA')
        release.prepare(self.root, self.backups)

    def tearDown(self):
        self.temp.cleanup()

    def build(self, version):
        for asset in (self.dist / 'assets').iterdir():
            asset.unlink()
        for extension in ('js', 'css'):
            (self.dist / 'assets' / f'index-{version}.{extension}').write_text(version)
        (self.dist / 'favicon.svg').write_text('<svg/>')
        (self.dist / 'index.html').write_text(
            f'<title>Morgan el Pirata</title><script src="./assets/index-{version}.js"></script>'
            f'<link rel="stylesheet" href="./assets/index-{version}.css">')

    def test_publish_and_rollback_keep_old_and_new_asset_urls(self):
        first = release.publish(self.dist, self.root, self.backups)
        self.build('BBBBBB')
        second = release.publish(self.dist, self.root, self.backups)
        self.assertEqual(second['previousRelease'], first['releaseId'])
        self.assertEqual(release.current_release(self.root), second['releaseId'])
        for version in ('AAAAAA', 'BBBBBB'):
            self.assertTrue((self.root / 'shared/assets' / f'index-{version}.js').exists())
        release.rollback(self.root, self.backups, first['releaseId'])
        self.assertEqual(release.current_release(self.root), first['releaseId'])
        self.assertTrue((self.root / 'shared/assets/index-BBBBBB.js').exists())

    def test_installable_shell_files_publish_with_fixed_names(self):
        self.build('AAAAAA')
        (self.dist / 'manifest.webmanifest').write_text('{"name":"Morgan el Pirata"}')
        (self.dist / 'sw.js').write_text('self.addEventListener("fetch", () => {});')
        (self.dist / 'icons').mkdir()
        (self.dist / 'icons' / 'icon-192.png').write_bytes(b'\x89PNG')
        (self.dist / 'index.html').write_text(
            '<title>Morgan el Pirata</title><link rel="manifest" href="./manifest.webmanifest">'
            '<link rel="apple-touch-icon" href="./icons/icon-192.png"><script src="./assets/index-AAAAAA.js"></script>'
            '<link rel="stylesheet" href="./assets/index-AAAAAA.css">')
        manifest = release.publish(self.dist, self.root, self.backups)
        current = self.root / 'current'
        for name in ('manifest.webmanifest', 'sw.js', 'icons/icon-192.png'):
            self.assertIn(name, manifest['files'])
            self.assertEqual((current / name).stat().st_mode & 0o777, 0o644)
        self.assertEqual((current / 'icons').stat().st_mode & 0o777, 0o755)
        self.assertFalse((self.root / 'shared' / 'icons').exists())
        (self.dist / 'icons' / 'notes.txt').write_text('x')
        with self.assertRaisesRegex(ValueError, 'Unexpected build file'):
            release.inspect_dist(self.dist)

    def test_unexpected_private_file_rejected_before_switch(self):
        first = release.publish(self.dist, self.root, self.backups)
        (self.dist / '.env').write_text('test-only placeholder')
        with self.assertRaisesRegex(ValueError, 'Unexpected build file'):
            release.publish(self.dist, self.root, self.backups)
        self.assertEqual(release.current_release(self.root), first['releaseId'])

    def test_symlink_rejected(self):
        (self.dist / 'assets/link-AAAAAA.js').symlink_to(self.dist / 'index.html')
        with self.assertRaisesRegex(ValueError, 'Symlink rejected'):
            release.inspect_dist(self.dist)

    def test_special_file_rejected_without_blocking(self):
        os.mkfifo(self.dist / 'assets/special-AAAAAA.js')
        with self.assertRaisesRegex(ValueError, 'Not a regular file'):
            release.inspect_dist(self.dist)

    def test_hash_collision_preserves_current(self):
        first = release.publish(self.dist, self.root, self.backups)
        (self.dist / 'assets/index-AAAAAA.js').write_text('changed without new hash')
        with self.assertRaisesRegex(ValueError, 'Immutable asset collision'):
            release.publish(self.dist, self.root, self.backups)
        self.assertEqual(release.current_release(self.root), first['releaseId'])

    def test_missing_reference_rejected(self):
        (self.dist / 'assets/index-AAAAAA.js').unlink()
        with self.assertRaises(ValueError):
            release.inspect_dist(self.dist)

    def test_rollback_tampered_release_rejected(self):
        first = release.publish(self.dist, self.root, self.backups)
        self.build('BBBBBB')
        second = release.publish(self.dist, self.root, self.backups)
        (self.root / 'releases' / first['releaseId'] / 'index.html').write_text('bad')
        with self.assertRaises(ValueError):
            release.rollback(self.root, self.backups, first['releaseId'])
        self.assertEqual(release.current_release(self.root), second['releaseId'])

    def test_permissions_and_manifest_outside_served_root(self):
        result = release.publish(self.dist, self.root, self.backups)
        current = self.root / 'current'
        self.assertEqual((current / 'index.html').stat().st_mode & 0o777, 0o644)
        self.assertEqual(current.resolve().stat().st_mode & 0o777, 0o755)
        self.assertEqual(self.backups.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.backups / (result['releaseId'] + '.json')).stat().st_mode & 0o777, 0o600)
        self.assertFalse((current / (result['releaseId'] + '.json')).exists())

    def test_private_coordinator_umask_keeps_static_directories_readable(self):
        previous_umask = os.umask(0o077)
        try:
            result = release.publish(self.dist, self.root, self.backups)
        finally:
            os.umask(previous_umask)
        current = self.root / 'current'
        self.assertEqual(current.resolve().stat().st_mode & 0o777, 0o755)
        self.assertEqual((current / 'assets').stat().st_mode & 0o777, 0o755)
        self.assertEqual((current / 'index.html').stat().st_mode & 0o777, 0o644)
        self.assertEqual((self.backups / (result['releaseId'] + '.json')).stat().st_mode & 0o777, 0o600)

    def test_publish_failure_does_not_switch_current(self):
        first = release.publish(self.dist, self.root, self.backups)
        self.build('BBBBBB')
        original = release.write_new
        def fail_manifest(path, data, mode):
            if path.parent == self.backups:
                raise OSError('simulated full disk')
            return original(path, data, mode)
        release.write_new = fail_manifest
        try:
            with self.assertRaises(OSError):
                release.publish(self.dist, self.root, self.backups)
        finally:
            release.write_new = original
        self.assertEqual(release.current_release(self.root), first['releaseId'])


if __name__ == '__main__':
    unittest.main()

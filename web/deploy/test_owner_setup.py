import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('setup_owner', Path(__file__).with_name('setup-owner.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class OwnerInputTests(unittest.TestCase):
    def test_matches_login_utf16_bounds(self):
        for value in ['a' * 14, 'a' * 129, '😀' * 7, '😀' * 65, '😀' * 70]:
            self.assertFalse(module.valid_password(value))
        for value in ['a' * 15, 'a' * 128, '😀' * 8, '😀' * 64, ' password with spaces ']:
            self.assertTrue(module.valid_password(value))
if __name__ == '__main__': unittest.main()

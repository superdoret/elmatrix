"""Shared test setup: make `src/` importable and isolate the data dir."""
import os
import shutil
import sys
import tempfile
import unittest

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SRC not in sys.path:
    sys.path.insert(0, SRC)

import paths  # noqa: E402,F401


class DataDirTestCase(unittest.TestCase):
    """Each test gets a fresh ELMATRIX_DATA_DIR."""

    def setUp(self):
        self._old = os.environ.get("ELMATRIX_DATA_DIR")
        self.data_dir = tempfile.mkdtemp(prefix="elmatrix-test-")
        os.environ["ELMATRIX_DATA_DIR"] = self.data_dir

    def tearDown(self):
        if self._old is None:
            os.environ.pop("ELMATRIX_DATA_DIR", None)
        else:
            os.environ["ELMATRIX_DATA_DIR"] = self._old
        shutil.rmtree(self.data_dir, ignore_errors=True)

from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if "psycopg2" not in sys.modules:
    fake_psycopg2 = types.ModuleType("psycopg2")
    fake_extras = types.ModuleType("psycopg2.extras")
    fake_extras.Json = lambda value: value
    fake_extras.RealDictCursor = object
    fake_psycopg2.extras = fake_extras  # type: ignore[attr-defined]
    sys.modules["psycopg2"] = fake_psycopg2
    sys.modules["psycopg2.extras"] = fake_extras

import memory_bridge_worker as mbw  # noqa: E402
import worker_task_handlers as wth  # noqa: E402
from worker_tasks import writing_dispatch  # noqa: E402


class TestWorkerTaskDispatchContract(unittest.TestCase):
    def test_worker_handler_exports_stay_callable_after_split(self):
        exported_names = [
            "process_memory_rollup_task",
            "process_writing_planning_task",
            "process_writing_prose_task",
            "process_writing_continuity_task",
            "process_writing_supervisor_task",
            "process_chapter_write_v3_task",
            "process_chapter_ledger_task",
            "process_memory_rollup_v3_task",
        ]

        for name in exported_names:
            with self.subTest(name=name):
                self.assertTrue(callable(getattr(wth, name)))
                self.assertIs(getattr(wth, name), getattr(writing_dispatch, name))

    def test_memory_bridge_worker_imports_split_handlers(self):
        self.assertTrue(callable(mbw.process_writing_planning_task))
        self.assertIs(mbw.process_writing_planning_task, writing_dispatch.process_writing_planning_task)
        self.assertTrue(callable(mbw.process_chapter_write_v3_task))
        self.assertIs(mbw.process_chapter_write_v3_task, writing_dispatch.process_chapter_write_v3_task)


if __name__ == "__main__":
    unittest.main()

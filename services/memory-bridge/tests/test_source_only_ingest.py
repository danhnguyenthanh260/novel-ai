from __future__ import annotations

import hashlib
import socket
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if "psycopg2" not in sys.modules:
    fake_psycopg2 = types.ModuleType("psycopg2")
    fake_extras = types.ModuleType("psycopg2.extras")
    setattr(fake_extras, "RealDictCursor", object)
    setattr(fake_extras, "Json", lambda value, **_kwargs: value)
    setattr(fake_psycopg2, "extras", fake_extras)
    setattr(fake_psycopg2, "connect", lambda *_args, **_kwargs: None)
    sys.modules["psycopg2"] = fake_psycopg2
    sys.modules["psycopg2.extras"] = fake_extras

import worker_ingest_handler  # noqa: E402


class _Cursor:
    def __init__(self, statements: list[tuple[str, object]]):
        self.statements = statements
        self.last_sql = ""
        self.rowcount = 1

    def execute(self, sql, params=None):
        self.last_sql = str(sql)
        self.statements.append((self.last_sql, params))

    def fetchone(self):
        if "FROM public.ingest_job" in self.last_sql:
            return {"id": 7, "status": "RUNNING", "config_json": {"processing_mode": "source_only"}}
        if "pending_count" in self.last_sql:
            return {"pending_count": 0}
        return None

    def close(self):
        return None


class _Connection:
    def __init__(self):
        self.statements: list[tuple[str, object]] = []

    def cursor(self, **_kwargs):
        return _Cursor(self.statements)


class TestSourceOnlyIngest(unittest.TestCase):
    def test_source_only_path_completes_with_network_disabled_and_raw_source_unchanged(self):
        source = "He\r\n\r\nis still here."
        conn = _Connection()
        task = {
            "id": 12,
            "story_id": 3,
            "job_id": 7,
            "payload_json": {
                "source_doc_id": "11111111-1111-1111-1111-111111111111",
                "chapter_id": "ch01",
                "processing_mode": "source_only",
            },
        }

        def deny_network(*_args, **_kwargs):
            raise AssertionError("source-only ingest attempted a network call")

        with (
            patch.object(worker_ingest_handler, "load_source_doc_text", return_value=source),
            patch.object(worker_ingest_handler, "repair_chapter_text") as repair_text,
            patch.object(worker_ingest_handler, "replace_source_passages", return_value=4) as replace_passages,
            patch.object(socket, "create_connection", side_effect=deny_network),
        ):
            worker_ingest_handler.process_chapter_ingest_task(conn, task)

        repair_text.assert_not_called()
        replace_passages.assert_called_once_with(
            conn,
            story_id=3,
            source_doc_id="11111111-1111-1111-1111-111111111111",
            chapter_id="ch01",
            source_doc_sha256=hashlib.sha256(source.encode("utf-8")).hexdigest(),
            source_text=source,
        )
        source_update = next(sql for sql, _params in conn.statements if "UPDATE public.source_doc" in sql)
        self.assertNotIn("raw_text =", source_update)
        task_params = next(params for sql, params in conn.statements if "UPDATE public.ingest_task" in sql)
        self.assertEqual(task_params[0]["provider_calls_used"], 0)
        self.assertEqual(task_params[0]["source_passage_count"], 4)
        job_params = next(params for sql, params in conn.statements if "UPDATE public.ingest_job" in sql)
        self.assertEqual(job_params[0], "DONE")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if "psycopg2" not in sys.modules:
    psycopg2_stub = ModuleType("psycopg2")
    extras_stub = ModuleType("psycopg2.extras")
    extras_stub.Json = lambda x: x
    extras_stub.RealDictCursor = object
    psycopg2_stub.extras = extras_stub
    sys.modules["psycopg2"] = psycopg2_stub
    sys.modules["psycopg2.extras"] = extras_stub

import worker_common  # noqa: E402,F401
import worker_split_proposal as wsp  # noqa: E402
import worker_task_handlers as wth  # noqa: E402


class TestOutlineCoverageGate(unittest.TestCase):
    def test_extract_outline_passes_with_97pct_coverage(self):
        chapter_text = "a" * 1000

        with patch.object(
            wsp.worker_common,
            "call_llm_json",
            return_value={"beats": [{"label": "b1", "start_char": 0, "end_char": 975}], "notes": "ok"},
        ):
            out = wsp.extract_structural_outline(
                chapter_text=chapter_text,
                chapter_id="ch03",
                max_retries=0,
                temperature=0.1,
            )
        self.assertTrue(bool((out.get("coverage") or {}).get("passes_gate")))

    def test_extract_outline_fail_message_contains_ratio_threshold(self):
        chapter_text = "a" * 1000
        with patch.object(
            wsp.worker_common,
            "call_llm_json",
            return_value={"beats": [{"label": "b1", "start_char": 0, "end_char": 960}], "notes": "low"},
        ):
            with self.assertRaises(ValueError) as err_ctx:
                wsp.extract_structural_outline(
                    chapter_text=chapter_text,
                    chapter_id="ch03",
                    max_retries=0,
                    temperature=0.1,
                )
        msg = str(err_ctx.exception)
        self.assertIn("OUTLINE_COVERAGE_FAIL", msg)
        self.assertIn("ratio=", msg)
        self.assertIn("ratio_non_ws=", msg)
        self.assertIn("threshold=0.97", msg)


class TestFailurePathTrace(unittest.TestCase):
    def _base_payload(self) -> dict:
        return {
            "chapter_text": "chapter sample text",
            "chapter_no": 3,
            "chapter_id": "ch03",
            "split_mode": "auto",
            "split_controls": {},
            "previous_split_contexts": [],
        }

    def _base_task(self) -> dict:
        return {
            "id": 193,
            "story_id": 1,
            "job_id": 110,
            "source_path": "chapter_3.txt",
        }

    def test_failed_build_still_traces_outline_reason(self):
        payload = self._base_payload()
        task = self._base_task()
        trace_calls: list[dict] = []

        def _trace_stub(_conn, _task, _payload, proposal, source):
            trace_calls.append({"source": source, "proposal": proposal})
            return {}

        with patch.object(wth, "parse_jsonb", return_value=payload), patch.object(wth, "parse_split_controls", return_value={}), patch.object(
            wth, "repair_chapter_text", return_value=(payload["chapter_text"], {})
        ), patch.object(wth, "resolve_active_agent_prompt", return_value={}), patch.object(
            wth, "ensure_task_idempotency_key", return_value="idem"
        ), patch.object(wth, "load_cached_split_result", return_value=None), patch.object(
            wth, "insert_agent_prompt_hydration_trace", return_value=None
        ), patch.object(
            wth, "build_split_proposal", side_effect=ValueError("OUTLINE_COVERAGE_FAIL:ratio=0.96")
        ), patch.object(wth, "_trace_split_agents", side_effect=_trace_stub):
            with self.assertRaises(ValueError):
                wth.process_chapter_split_task(object(), task)

        self.assertEqual(len(trace_calls), 1)
        self.assertEqual(trace_calls[0]["source"], "fresh_failed")
        proposal = trace_calls[0]["proposal"]
        self.assertEqual(proposal.get("rerun_reason"), "OUTLINE_COVERAGE_FAIL")
        self.assertEqual(proposal.get("operational_state"), "NEEDS_RETRY")

    def test_failed_build_non_outline_uses_generic_reason(self):
        payload = self._base_payload()
        task = self._base_task()
        trace_calls: list[dict] = []

        def _trace_stub(_conn, _task, _payload, proposal, source):
            trace_calls.append({"source": source, "proposal": proposal})
            return {}

        with patch.object(wth, "parse_jsonb", return_value=payload), patch.object(wth, "parse_split_controls", return_value={}), patch.object(
            wth, "repair_chapter_text", return_value=(payload["chapter_text"], {})
        ), patch.object(wth, "resolve_active_agent_prompt", return_value={}), patch.object(
            wth, "ensure_task_idempotency_key", return_value="idem"
        ), patch.object(wth, "load_cached_split_result", return_value=None), patch.object(
            wth, "insert_agent_prompt_hydration_trace", return_value=None
        ), patch.object(
            wth, "build_split_proposal", side_effect=RuntimeError("boom")
        ), patch.object(wth, "_trace_split_agents", side_effect=_trace_stub):
            with self.assertRaises(RuntimeError):
                wth.process_chapter_split_task(object(), task)

        self.assertEqual(len(trace_calls), 1)
        proposal = trace_calls[0]["proposal"]
        self.assertEqual(proposal.get("rerun_reason"), "SPLIT_PROPOSAL_BUILD_FAIL")


if __name__ == "__main__":
    unittest.main()

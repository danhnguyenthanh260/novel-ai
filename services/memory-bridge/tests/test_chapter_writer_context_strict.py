from __future__ import annotations

import os
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
    setattr(fake_extras, "Json", lambda value: value)
    fake_psycopg2.extras = fake_extras  # type: ignore[attr-defined]
    sys.modules["psycopg2"] = fake_psycopg2
    sys.modules["psycopg2.extras"] = fake_extras

from worker_chapter_writer import generate_chapter_v3  # noqa: E402


def working_set() -> dict:
    return {
        "anchor": {"story_pitch": "A test story", "style_dna": {"tone": "tense"}},
        "active_state": {"cast": [{"name": "A", "status": "ready"}], "timeline_facts": []},
        "meso_context": {"unresolved_loops": [], "milestone_summaries": []},
        "ephemeral": {"recent_changes": []},
    }


def writing_context() -> dict:
    return {
        "intent": {"chapter_id": "ch02", "chapter_goal": "continue"},
        "immediate_continuity": {"recent_snapshot_refs": ["working_set:abc"]},
        "current_state": {"active_cast": [{"label": "A", "value": "ready"}]},
        "debug_source_metadata": {"readiness": {"status": "proceed"}, "degraded_reasons": []},
    }


class TestChapterWriterContextStrictness(unittest.TestCase):
    def tearDown(self) -> None:
        os.environ.pop("WRITING_CONTEXT_REQUIRED", None)

    def test_absent_context_uses_explicit_compatibility_mode_by_default(self):
        with (
            patch("worker_chapter_writer.call_llm_text", return_value="ok") as call,
            patch("worker_chapter_writer.call_llm_json", return_value={"summary": "ok", "patches": []}),
        ):
            result = generate_chapter_v3(None, 1, "ch02", working_set(), "continue")

        self.assertEqual(result["metadata"]["writing_context_mode"], "compatibility_absent")
        self.assertFalse(result["metadata"]["writing_context_used"])
        self.assertEqual(result["metadata"]["fallback_reason_code"], "LEGACY_PAYLOAD_COMPAT")
        self.assertEqual(result["metadata"]["fallback_source"], "working_set")
        prompt = call.call_args.args[0][1]["content"]
        self.assertIn("WORKINGSET COMPATIBILITY CONTEXT:", prompt)
        self.assertIn("Pitch: A test story", prompt)

    def test_required_flag_blocks_absent_context(self):
        os.environ["WRITING_CONTEXT_REQUIRED"] = "1"

        with self.assertRaisesRegex(ValueError, "WRITING_CONTEXT_REQUIRED"):
            generate_chapter_v3(None, 1, "ch02", working_set(), "continue")

    def test_present_malformed_context_does_not_fallback(self):
        with self.assertRaisesRegex(ValueError, "WRITING_CONTEXT_MALFORMED"):
            generate_chapter_v3(None, 1, "ch02", working_set(), "continue", writing_context="bad")  # type: ignore[arg-type]

    def test_present_context_requires_preflight(self):
        with self.assertRaisesRegex(ValueError, "WRITING_CONTEXT_PREFLIGHT_MALFORMED"):
            generate_chapter_v3(None, 1, "ch02", working_set(), "continue", writing_context=writing_context())

    def test_present_context_requires_known_preflight_status(self):
        with self.assertRaisesRegex(ValueError, "WRITING_CONTEXT_PREFLIGHT_STATUS_INVALID"):
            generate_chapter_v3(
                None,
                1,
                "ch02",
                working_set(),
                "continue",
                writing_context=writing_context(),
                writing_context_preflight={"status": "mystery"},
            )

    def test_blocked_preflight_does_not_fallback(self):
        with self.assertRaisesRegex(ValueError, "WRITING_CONTEXT_PREFLIGHT_BLOCKED"):
            generate_chapter_v3(
                None,
                1,
                "ch02",
                working_set(),
                "continue",
                writing_context=writing_context(),
                writing_context_preflight={"status": "blocked", "block_reasons": ["MISSING_CURRENT_STATE"]},
            )

    def test_degraded_context_records_contract_mode(self):
        with (
            patch("worker_chapter_writer.call_llm_text", return_value="ok"),
            patch("worker_chapter_writer.call_llm_json", return_value={"summary": "ok", "patches": []}),
        ):
            result = generate_chapter_v3(
                None,
                1,
                "ch02",
                working_set(),
                "continue",
                writing_context=writing_context(),
                writing_context_preflight={
                    "status": "degraded",
                    "degraded_reasons": ["LOW_CONFIDENCE_RELATIONSHIP_STATE"],
                    "block_reasons": [],
                },
            )

        self.assertEqual(result["metadata"]["writing_context_mode"], "contract")
        self.assertTrue(result["metadata"]["writing_context_used"])
        self.assertEqual(result["metadata"]["writing_context_preflight_status"], "degraded")
        self.assertIsNone(result["metadata"]["fallback_reason_code"])
        self.assertIsNone(result["metadata"]["fallback_source"])

    def test_valid_context_records_contract_mode_without_working_set_prompt_blend(self):
        with (
            patch("worker_chapter_writer.call_llm_text", return_value="ok") as call,
            patch("worker_chapter_writer.call_llm_json", return_value={"summary": "ok", "patches": []}),
        ):
            result = generate_chapter_v3(
                None,
                1,
                "ch02",
                working_set(),
                "continue",
                writing_context=writing_context(),
                writing_context_preflight={"status": "proceed", "degraded_reasons": [], "block_reasons": []},
                writing_context_debug={"assembler_version": "chapter_writing_context_assembler_v1"},
            )

        self.assertEqual(result["metadata"]["writing_context_mode"], "contract")
        self.assertTrue(result["metadata"]["writing_context_used"])
        self.assertEqual(result["metadata"]["writing_context_preflight_status"], "proceed")
        self.assertIsNone(result["metadata"]["fallback_reason_code"])
        self.assertIsNone(result["metadata"]["fallback_source"])
        prompt = call.call_args.args[0][1]["content"]
        self.assertIn("Disabled because a valid WritingContext is present", prompt)
        self.assertNotIn("Pitch: A test story", prompt)


if __name__ == "__main__":
    unittest.main()

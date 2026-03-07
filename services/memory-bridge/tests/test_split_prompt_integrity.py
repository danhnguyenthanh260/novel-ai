from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import ModuleType


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

import worker_common  # noqa: E402


class TestSplitPromptIntegrity(unittest.TestCase):
    def test_prompt_sections_ordered(self):
        prev = os.environ.get("SPLIT_PROMPT_INTEGRITY_V1_ENABLED")
        os.environ["SPLIT_PROMPT_INTEGRITY_V1_ENABLED"] = "1"
        captured = {}

        def _fake_call_llm_json(messages, max_tokens, temperature, timeout_sec=0, raise_on_error=False):
            captured["user"] = str((messages or [{}, {}])[1].get("content") or "")
            return {"boundaries": [{"at": 12, "reason": "ok"}]}

        original = worker_common.call_llm_json
        worker_common.call_llm_json = _fake_call_llm_json
        try:
            worker_common.llm_boundaries_for_chunk(
                "That afternoon Kuro went to the library.",
                strict=True,
                tech_rules="- Rule A",
                active_constraints=["Must split at temporal anchor"],
                hard_anchor_specs=[{"id": "h1", "type": "TEMPORAL_HARD", "at": 4, "tolerance_chars": 200}],
                chunk_start=0,
            )
        finally:
            worker_common.call_llm_json = original
            if prev is None:
                os.environ.pop("SPLIT_PROMPT_INTEGRITY_V1_ENABLED", None)
            else:
                os.environ["SPLIT_PROMPT_INTEGRITY_V1_ENABLED"] = prev

        prompt = captured.get("user", "")
        i_mech = prompt.find("SECTION: CORE BOUNDARY MECHANICS")
        i_hard = prompt.find("SECTION: HARD CONSTRAINTS")
        i_tech = prompt.find("SECTION: TECHNICAL GUIDANCE")
        i_anchor = prompt.find("SECTION: ANCHOR VALIDATION CONTRACT")
        self.assertTrue(i_mech >= 0 and i_hard >= 0 and i_tech >= 0 and i_anchor >= 0)
        self.assertTrue(i_mech < i_hard < i_tech < i_anchor)


if __name__ == "__main__":
    unittest.main()

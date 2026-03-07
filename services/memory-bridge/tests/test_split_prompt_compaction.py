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


class TestSplitPromptCompaction(unittest.TestCase):
    def test_compaction_applies_and_keeps_hard_constraints(self):
        prev_integrity = os.environ.get("SPLIT_PROMPT_INTEGRITY_V1_ENABLED")
        prev_soft_cap = os.environ.get("SPLIT_PROMPT_SOFT_CAP_CHARS")
        os.environ["SPLIT_PROMPT_INTEGRITY_V1_ENABLED"] = "1"
        os.environ["SPLIT_PROMPT_SOFT_CAP_CHARS"] = "1200"
        traces = []
        captured = {}

        def _fake_call_llm_json(messages, max_tokens, temperature, timeout_sec=0, raise_on_error=False):
            captured["user"] = str((messages or [{}, {}])[1].get("content") or "")
            return {"boundaries": [{"at": 20, "reason": "ok"}]}

        original = worker_common.call_llm_json
        worker_common.call_llm_json = _fake_call_llm_json
        try:
            worker_common.llm_boundaries_for_chunk(
                "A" * 2000,
                strict=False,
                tech_rules="- " + ("Very long guidance. " * 500),
                active_constraints=["Must preserve temporal anchors"],
                split_trace_chunks=traces,
                chunk_start=0,
            )
        finally:
            worker_common.call_llm_json = original
            if prev_integrity is None:
                os.environ.pop("SPLIT_PROMPT_INTEGRITY_V1_ENABLED", None)
            else:
                os.environ["SPLIT_PROMPT_INTEGRITY_V1_ENABLED"] = prev_integrity
            if prev_soft_cap is None:
                os.environ.pop("SPLIT_PROMPT_SOFT_CAP_CHARS", None)
            else:
                os.environ["SPLIT_PROMPT_SOFT_CAP_CHARS"] = prev_soft_cap

        self.assertTrue(traces)
        self.assertTrue(bool(traces[0].get("prompt_compaction_applied")))
        prompt = captured.get("user", "")
        self.assertIn("SECTION: HARD CONSTRAINTS", prompt)
        self.assertIn("...[GUIDANCE_COMPACTED]", prompt)


if __name__ == "__main__":
    unittest.main()

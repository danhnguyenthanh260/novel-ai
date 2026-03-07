from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if "psycopg2" not in sys.modules:
    sys.modules["psycopg2"] = SimpleNamespace(connect=lambda *args, **kwargs: None)
if "psycopg2.extras" not in sys.modules:
    sys.modules["psycopg2.extras"] = SimpleNamespace(Json=lambda x: x, RealDictCursor=object)

import worker_common  # noqa: E402


class TestSplitAnchorValidationContract(unittest.TestCase):
    def test_prompt_contains_anchor_contract_and_trace_captures_decisions(self):
        captured = {}

        def _fake_call_llm_json(messages, max_tokens, temperature, timeout_sec=0, raise_on_error=False):
            captured["messages"] = messages
            return {
                "boundaries": [{"at": 14, "reason": "anchor accepted"}],
                "anchor_decisions": [{"anchor_id": "h001", "decision": "accepted", "reason": "Exact match"}],
            }

        original = worker_common.call_llm_json
        worker_common.call_llm_json = _fake_call_llm_json
        try:
            traces = []
            out = worker_common.llm_boundaries_for_chunk(
                "That afternoon they went to the library.",
                strict=True,
                hard_anchor_specs=[{"id": "h001", "type": "TEMPORAL_HARD", "at": 4, "tolerance_chars": 200}],
                split_trace_chunks=traces,
                chunk_start=0,
                chunk_index=0,
            )
        finally:
            worker_common.call_llm_json = original

        self.assertTrue(out)
        user_prompt = str((captured.get("messages") or [{}, {}])[1].get("content") or "")
        self.assertIn("ANCHOR VALIDATION CONTRACT", user_prompt)
        self.assertIn("HARD_ANCHORS_JSON", user_prompt)
        self.assertTrue(traces)
        self.assertIn("anchor_decisions", traces[0])


if __name__ == "__main__":
    unittest.main()

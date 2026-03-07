from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from worker_split_refine import llm_semantic_resplit_offsets  # noqa: E402


def _normalize(points: list[int], text_len: int) -> list[int]:
    return sorted(set(int(p) for p in points if 0 < int(p) < int(text_len)))


class TestSplitAnchorGuardSemanticResplit(unittest.TestCase):
    def test_guard_clamps_boundary_to_hard_anchor(self):
        chapter_text = "A" * 4000
        split_points = [1500]
        llm_state = {"used": 0, "max_calls": 3}

        def _can_run(_state):
            return True

        def _consume(state):
            state["used"] = int(state.get("used") or 0) + 1

        def _fake_call_llm_json(**_kwargs):
            return {"offsets": [2300], "confidence": 0.95, "proofs": [{"why": "move"}]}

        points, report = llm_semantic_resplit_offsets(
            chapter_text,
            split_points,
            llm_state,
            s3_min_confidence=0.5,
            s3_max_offset_jump=2000,
            s3_min_proof_ratio=0.1,
            s3_max_rejected_jump_ratio=1.0,
            llm_can_run=_can_run,
            llm_consume_call=_consume,
            call_llm_json=_fake_call_llm_json,
            normalize_split_points=_normalize,
            hard_anchor_positions=[1600],
            hard_anchor_tolerance_chars=120,
        )
        self.assertEqual(points, [1600])
        self.assertGreaterEqual(int(report.get("anchor_guard_clamped_count") or 0), 1)


if __name__ == "__main__":
    unittest.main()

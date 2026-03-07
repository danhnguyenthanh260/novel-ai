from __future__ import annotations

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

import worker_writing_analysis as wwa  # noqa: E402


class TestWritingAnalysisVetting(unittest.TestCase):
    def test_state_change_promotion_promotes_injury_and_asset(self):
        candidate_facts = [
            {
                "subject": "Kuro",
                "predicate": "is injured",
                "object": "side",
                "classification": "EPHEMERAL",
                "entity_type": "PERSON",
                "confidence": 0.92,
                "evidence": "side pain and bruising",
                "is_unreliable": False,
                "affinity_weight": 0.0,
            },
            {
                "subject": "Kuro",
                "predicate": "buys",
                "object": "shielding and supplies",
                "classification": "EPHEMERAL",
                "entity_type": "ITEM",
                "confidence": 0.88,
                "evidence": "he buys shielding gear",
                "is_unreliable": False,
                "affinity_weight": 0.0,
            },
            {
                "subject": "Kuro",
                "predicate": "looked",
                "object": "at the corner",
                "classification": "EPHEMERAL",
                "entity_type": "PERSON",
                "confidence": 0.93,
                "evidence": "looked at the corner",
                "is_unreliable": False,
                "affinity_weight": 0.0,
            },
        ]
        out = wwa._vet_candidate_facts(candidate_facts, context={})
        accepted = out.get("accepted_facts") or []
        self.assertEqual(len(accepted), 2)
        self.assertGreaterEqual(int(out.get("promoted_count") or 0), 2)
        reasons = {str(x.get("promotion_reason") or "") for x in accepted}
        self.assertIn("INJURY_OR_HEALTH_CHANGE", reasons)
        self.assertIn("ASSET_OR_TOOL_ACQUIRED", reasons)
        self.assertEqual(int(out.get("ephemeral_filtered_count") or 0), 1)

    def test_character_voice_pronoun_is_rejected(self):
        raw = [
            {"name": "He", "tone": "reflective", "sentence_cadence": "med", "vocabulary_tier": "mid"},
            {"name": "Kuro", "tone": "tense", "sentence_cadence": "short", "vocabulary_tier": "mid"},
        ]
        voices, report = wwa._resolve_character_voices_with_report(raw, context={})
        names = [str(v.get("name") or "") for v in voices]
        self.assertIn("Kuro", names)
        self.assertNotIn("He", names)
        self.assertGreaterEqual(int(report.get("dropped_pronoun_count") or 0), 1)

    def test_world_rules_semantic_dedup_merges_duplicates(self):
        raw = [
            {"label": "Gangs exist in the area", "detail": "Gangs are present and can be encountered."},
            {"label": "Street encounters", "detail": "Gangs exist and pose a threat to individuals."},
            {"label": "Technology", "detail": "Characters use and acquire technological items like shielding and filters."},
            {"label": "Technology", "detail": "They use tech like twin-band emitters for their mission."},
        ]
        deduped, report = wwa._dedup_world_rules_semantic(raw)
        self.assertLessEqual(len(deduped), 3)
        self.assertGreaterEqual(
            int(report.get("merged_count") or 0) + int(report.get("dropped_scene_local_count") or 0),
            1,
        )

    def test_open_loop_semantic_merge_collapses_injury_variants(self):
        loops = [
            {"id": "ol02", "description": "The nature of the bruise on Kuro's side", "urgency": 0.7},
            {"id": "ol03", "description": "The reason for Kuro's limping", "urgency": 0.6},
        ]
        merged = wwa._merge_open_loops_semantic(loops, accepted_facts=[])
        self.assertEqual(len(merged), 1)
        self.assertGreaterEqual(float(merged[0].get("urgency") or 0.0), 0.7)
        self.assertIn("merged_from_ids", merged[0])

    def test_empty_warning_reason_resolves_overfiltered(self):
        reason = wwa._resolve_empty_warning_reason(
            {
                "clean_count": 0,
                "promoted_count": 0,
                "low_confidence_count": 0,
                "ephemeral_filtered_count": 40,
            }
        )
        self.assertEqual(reason, "EPHEMERAL_OVERFILTERED")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Minimal stub so module import works in environments without psycopg2.
if "psycopg2" not in sys.modules:
    fake_psycopg2 = types.ModuleType("psycopg2")
    fake_extras = types.ModuleType("psycopg2.extras")
    setattr(fake_extras, "RealDictCursor", object)
    setattr(fake_extras, "Json", lambda value, **_kwargs: value)
    fake_psycopg2.extras = fake_extras  # type: ignore[attr-defined]
    sys.modules["psycopg2"] = fake_psycopg2
    sys.modules["psycopg2.extras"] = fake_extras

from worker_writing_analysis import _validate_analysis_chunk_artifact  # noqa: E402


class TestAnalysisContractEnforcement(unittest.TestCase):
    def test_validate_analysis_chunk_artifact_missing(self):
        ok, err = _validate_analysis_chunk_artifact({})
        self.assertFalse(ok)
        self.assertEqual(err, "ANALYSIS_INPUT_MISSING_CHUNK_ARTIFACT")

    def test_validate_analysis_chunk_artifact_not_ready(self):
        artifact = {
            "status": "NOT_READY",
            "coverage": {"coverage_ratio": 1.0},
            "chunks": [{"chunk_id": "x", "order": 1, "start_char": 0, "end_char": 10}],
        }
        ok, err = _validate_analysis_chunk_artifact(artifact)
        self.assertFalse(ok)
        self.assertEqual(err, "ANALYSIS_INPUT_STATUS_NOT_READY")

    def test_validate_analysis_chunk_artifact_coverage_fail(self):
        artifact = {
            "status": "READY_FOR_ANALYSIS",
            "coverage": {"coverage_ratio": 0.75},
            "chunks": [{"chunk_id": "x", "order": 1, "start_char": 0, "end_char": 10}],
        }
        ok, err = _validate_analysis_chunk_artifact(artifact)
        self.assertFalse(ok)
        self.assertEqual(err, "ANALYSIS_INPUT_COVERAGE_GATE_FAIL")

    def test_validate_analysis_chunk_artifact_ready(self):
        artifact = {
            "status": "READY_FOR_ANALYSIS",
            "coverage": {"coverage_ratio": 1.0, "passes_gate": True},
            "chunks": [{"chunk_id": "x", "order": 1, "start_char": 0, "end_char": 10}],
        }
        ok, err = _validate_analysis_chunk_artifact(artifact)
        self.assertTrue(ok)
        self.assertEqual(err, "")

#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from pathlib import Path

# Keep deterministic alpha for this test.
os.environ["HISTORIAN_V3_AFFINITY_EWMA_ALPHA"] = "0.5"

sys.path.append(str(Path(__file__).resolve().parents[1]))

from worker_writing_analysis import _calculate_affinity_shift  # noqa: E402


def _assert_close(actual: float, expected: float, eps: float = 1e-4) -> None:
    if abs(actual - expected) > eps:
        raise AssertionError(f"expected {expected}, got {actual}")


def main() -> int:
    # Positive events should raise affinity, but smoothly (EWMA).
    new_a, shift = _calculate_affinity_shift(0.2, ["they protect each other and trust grows"])
    if not (new_a > 0.2 and shift > 0):
        raise AssertionError(f"expected positive shift, got new={new_a}, shift={shift}")

    # Negative events should lower affinity.
    new_b, shift_b = _calculate_affinity_shift(0.6, ["they betray and attack each other"])
    if not (new_b < 0.6 and shift_b < 0):
        raise AssertionError(f"expected negative shift, got new={new_b}, shift={shift_b}")

    # Determinism check.
    new_c1, shift_c1 = _calculate_affinity_shift(0.1, ["ally support and care"])
    new_c2, shift_c2 = _calculate_affinity_shift(0.1, ["ally support and care"])
    _assert_close(new_c1, new_c2)
    _assert_close(shift_c1, shift_c2)

    # Bounds check.
    new_d, _ = _calculate_affinity_shift(0.95, ["save protect trust forgive ally support care love"])
    if not (-1.0 <= new_d <= 1.0):
        raise AssertionError(f"expected clamped range, got {new_d}")

    print("OK: affinity EWMA tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

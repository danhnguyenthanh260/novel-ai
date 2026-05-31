#!/usr/bin/env python3
"""Report Memory Bridge worker Python line-budget pressure."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path


DEFAULT_TARGET = 500
DEFAULT_HARD_CAP = 900
EXCLUDED_DIRS = {".runtime", "__pycache__", "scripts", "tests"}


@dataclass(frozen=True)
class BudgetRow:
    path: Path
    lines: int
    target: int
    hard_cap: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        default=Path(__file__).resolve().parents[1],
        type=Path,
        help="Memory Bridge root directory to inspect.",
    )
    parser.add_argument(
        "--target",
        default=DEFAULT_TARGET,
        type=int,
        help="Line-count target that reports a warning.",
    )
    parser.add_argument(
        "--hard-cap",
        default=DEFAULT_HARD_CAP,
        type=int,
        help="Line-count hard cap used with --fail-on-hard-cap.",
    )
    parser.add_argument(
        "--fail-on-hard-cap",
        action="store_true",
        help="Exit non-zero when files exceed the hard cap.",
    )
    return parser.parse_args()


def should_skip(path: Path, root: Path) -> bool:
    relative = path.relative_to(root)
    return any(part in EXCLUDED_DIRS for part in relative.parts)


def count_lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


def collect_rows(root: Path, target: int, hard_cap: int) -> list[BudgetRow]:
    rows: list[BudgetRow] = []
    for path in sorted(root.rglob("*.py")):
        if should_skip(path, root):
            continue
        lines = count_lines(path)
        if lines <= target:
            continue
        rows.append(BudgetRow(path=path, lines=lines, target=target, hard_cap=hard_cap))
    return sorted(rows, key=lambda row: row.lines, reverse=True)


def format_path(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    if not root.exists():
        print(f"Worker line budget check failed: root does not exist: {root}")
        return 2

    rows = collect_rows(root, args.target, args.hard_cap)
    hard_cap_rows = [row for row in rows if row.lines > row.hard_cap]

    if not rows:
        print("No Memory Bridge worker files over target line budget.")
        return 0

    print("Memory Bridge worker line-budget report:")
    print(f"- root: {root}")
    print(f"- target: {args.target} lines")
    print(f"- hard cap: {args.hard_cap} lines")
    print(f"- fail on hard cap: {bool(args.fail_on_hard_cap)}")
    print("")

    if hard_cap_rows:
        print("Hard-cap pressure:")
        for row in hard_cap_rows:
            print(
                f"- {format_path(row.path, root)}: {row.lines} lines "
                f"(target {row.target}, cap {row.hard_cap})"
            )
        print("")

    warning_rows = [row for row in rows if row.lines <= row.hard_cap]
    if warning_rows:
        print("Over target:")
        for row in warning_rows:
            print(
                f"- {format_path(row.path, root)}: {row.lines} lines "
                f"(target {row.target}, cap {row.hard_cap})"
            )

    if args.fail_on_hard_cap and hard_cap_rows:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

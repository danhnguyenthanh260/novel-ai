#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ONE="${ROOT_DIR}/scripts/ops/run_worker_lane.sh"

"${RUN_ONE}" split "$@"
"${RUN_ONE}" analysis "$@"
"${RUN_ONE}" writing "$@"

echo "[worker-lanes] split+analysis+writing started"

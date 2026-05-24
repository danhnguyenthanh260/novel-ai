#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.runtime"

for lane in split analysis writing all; do
  pid_file="${RUNTIME_DIR}/memory_worker_${lane}.pid"
  if [[ -f "${pid_file}" ]]; then
    pid="$(cat "${pid_file}" || true)"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" || true
      echo "[worker-lanes] stopped lane=${lane} pid=${pid}"
    fi
    rm -f "${pid_file}"
  fi
done

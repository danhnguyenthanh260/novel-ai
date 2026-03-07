#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_PY="${ROOT_DIR}/.venv/bin/python3"
WORKER_PY="${ROOT_DIR}/services/memory-bridge/memory_bridge_worker.py"
ENV_FILE="${ROOT_DIR}/apps/studio/.env.local"
RUNTIME_DIR="${ROOT_DIR}/.runtime"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <split|analysis|writing|all> [worker args...]"
  exit 1
fi

LANE="$1"
shift || true

case "${LANE}" in
  split|analysis|writing|all) ;;
  *)
    echo "invalid lane: ${LANE} (expected split|analysis|writing|all)"
    exit 1
    ;;
esac

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing env file: ${ENV_FILE}"
  exit 1
fi

mkdir -p "${RUNTIME_DIR}"

# shellcheck disable=SC1090
source "${ENV_FILE}"
export DATABASE_URL="${DATABASE_URL:-postgresql://novel:novelpass@localhost:5433/novel}"
export DB_DSN="${DB_DSN:-${DATABASE_URL}}"
export WORKER_FLOW_LANE="${LANE}"

PID_FILE="${RUNTIME_DIR}/memory_worker_${LANE}.pid"
LOG_FILE="${RUNTIME_DIR}/memory_worker_${LANE}.log"

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    echo "lane ${LANE} already running with pid ${OLD_PID}"
    exit 0
  fi
fi

echo "[worker-lane] starting lane=${LANE} log=${LOG_FILE}"
nohup "${VENV_PY}" "${WORKER_PY}" "$@" >> "${LOG_FILE}" 2>&1 &
NEW_PID=$!
echo "${NEW_PID}" > "${PID_FILE}"
echo "[worker-lane] started lane=${LANE} pid=${NEW_PID}"

#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STUDIO_DIR="$ROOT_DIR/apps/studio"
RUNTIME_DIR="$ROOT_DIR/.runtime/e2e"
mkdir -p "$RUNTIME_DIR"

RUN_TESTS=0
SKIP_LLM=0
SKIP_STUDIO=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-tests)
      RUN_TESTS=1
      shift
      ;;
    --skip-llm)
      SKIP_LLM=1
      shift
      ;;
    --skip-studio)
      SKIP_STUDIO=1
      shift
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: scripts/ops/start_e2e_stack.sh [--run-tests] [--skip-llm] [--skip-studio]

Starts the local real E2E stack:
  - Docker Compose services: PostgreSQL, Qdrant, Neo4j, Historian bridge
  - Local llama.cpp OpenAI-compatible server on port 8080
  - Studio dev server on port 3000
  - Real LLM preflight via apps/studio/scripts/doctor_llm.mjs

Environment overrides:
  LLAMA_SERVER_BIN       default: ~/llama.cpp/build/bin/llama-server
  LLAMA_MODEL_PATH       default: ~/models/qwen2.5-7b/model.gguf
  LLAMA_CONTEXT          default: 16384
  LLAMA_NGL              default: 28
  LLAMA_THREADS          default: 6
  LLAMA_FLASH_ATTN       default: on
  LLAMA_HOST             default: 0.0.0.0
  LLAMA_PORT             default: 8080
  LLM_API_BASE           default: http://localhost:8080/v1
  LLM_API_KEY            default: local
  LLM_MODEL              default: qwen2.5-7b
  E2E_STUDIO_PORT        default: 3000
  E2E_BASE_URL           default: http://localhost:3000
USAGE
      exit 0
      ;;
    *)
      echo "[e2e:start] unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

export DATABASE_URL="${DATABASE_URL:-postgresql://novel:novelpass@localhost:5433/novel}"
export HISTORIAN_MCP_BASE_URL="${HISTORIAN_MCP_BASE_URL:-http://localhost:8090}"
export HISTORIAN_QDRANT_ENABLED="${HISTORIAN_QDRANT_ENABLED:-1}"
export HISTORIAN_NEO4J_ENABLED="${HISTORIAN_NEO4J_ENABLED:-1}"
export LLM_API_BASE="${LLM_API_BASE:-http://localhost:8080/v1}"
export LLM_API_KEY="${LLM_API_KEY:-local}"
export LLM_MODEL="${LLM_MODEL:-qwen2.5-7b}"
export E2E_REAL_LLM="${E2E_REAL_LLM:-1}"

LLAMA_SERVER_BIN="${LLAMA_SERVER_BIN:-$HOME/llama.cpp/build/bin/llama-server}"
LLAMA_MODEL_PATH="${LLAMA_MODEL_PATH:-$HOME/models/qwen2.5-7b/model.gguf}"
LLAMA_CONTEXT="${LLAMA_CONTEXT:-16384}"
LLAMA_NGL="${LLAMA_NGL:-28}"
LLAMA_THREADS="${LLAMA_THREADS:-6}"
LLAMA_FLASH_ATTN="${LLAMA_FLASH_ATTN:-on}"
LLAMA_HOST="${LLAMA_HOST:-0.0.0.0}"
LLAMA_PORT="${LLAMA_PORT:-8080}"
E2E_STUDIO_PORT="${E2E_STUDIO_PORT:-3000}"
export E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:${E2E_STUDIO_PORT}}"

log() {
  printf '[e2e:start] %s\n' "$*"
}

fail() {
  printf '[e2e:start] ERROR: %s\n' "$*" >&2
  exit 1
}

http_ok() {
  local url="$1"
  curl -fsS --max-time 3 "$url" >/dev/null 2>&1
}

wait_http() {
  local label="$1"
  local url="$2"
  local timeout_seconds="${3:-60}"
  local started
  started="$(date +%s)"
  until http_ok "$url"; do
    if (( "$(date +%s)" - started >= timeout_seconds )); then
      fail "$label did not become ready at $url within ${timeout_seconds}s"
    fi
    sleep 2
  done
  log "$label ready: $url"
}

select_docker() {
  if command -v docker >/dev/null 2>&1 && docker version >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
    return
  fi

  if command -v docker.exe >/dev/null 2>&1 && docker.exe version >/dev/null 2>&1; then
    DOCKER_CMD=(docker.exe)
    return
  fi

  fail "Docker is not reachable from WSL. Start Docker Desktop and enable WSL integration."
}

compose() {
  "${DOCKER_CMD[@]}" compose -f "$ROOT_DIR/infra/docker-compose.yml" "$@"
}

docker_cmd() {
  "${DOCKER_CMD[@]}" "$@"
}

start_compose_services() {
  select_docker
  log "starting Docker Compose services"
  compose up -d postgres qdrant neo4j historian-mcp-bridge

  log "waiting for PostgreSQL"
  local started
  started="$(date +%s)"
  until docker_cmd exec novel_pg pg_isready -U novel -d novel >/dev/null 2>&1; do
    if (( "$(date +%s)" - started >= 90 )); then
      fail "PostgreSQL did not become healthy within 90s"
    fi
    sleep 2
  done
  log "PostgreSQL ready"

  wait_http "Qdrant" "http://localhost:6333/healthz" 60
  wait_http "Neo4j" "http://localhost:7474" 90
  wait_http "Historian bridge" "$HISTORIAN_MCP_BASE_URL/healthz" 90
}

start_llm() {
  if [[ "$SKIP_LLM" -eq 1 ]]; then
    log "skipping local LLM startup by request"
    return
  fi

  if http_ok "$LLM_API_BASE/models"; then
    log "local LLM already reachable: $LLM_API_BASE"
    return
  fi

  [[ -x "$LLAMA_SERVER_BIN" ]] || fail "llama-server not executable: $LLAMA_SERVER_BIN"
  [[ -f "$LLAMA_MODEL_PATH" ]] || fail "LLM model file not found: $LLAMA_MODEL_PATH"

  local log_file="$RUNTIME_DIR/llama-server.log"
  local pid_file="$RUNTIME_DIR/llama-server.pid"

  log "starting llama.cpp server on port $LLAMA_PORT"
  nohup "$LLAMA_SERVER_BIN" \
    -m "$LLAMA_MODEL_PATH" \
    -c "$LLAMA_CONTEXT" \
    -ngl "$LLAMA_NGL" \
    -t "$LLAMA_THREADS" \
    --flash-attn "$LLAMA_FLASH_ATTN" \
    --port "$LLAMA_PORT" \
    --host "$LLAMA_HOST" \
    >"$log_file" 2>&1 &
  echo "$!" >"$pid_file"

  wait_http "llama.cpp server" "$LLM_API_BASE/models" 180
}

start_studio() {
  if [[ "$SKIP_STUDIO" -eq 1 ]]; then
    log "skipping Studio dev server startup by request"
    return
  fi

  if http_ok "$E2E_BASE_URL/api/stories"; then
    log "Studio already reachable: $E2E_BASE_URL"
    return
  fi

  local log_file="$RUNTIME_DIR/studio-dev.log"
  local pid_file="$RUNTIME_DIR/studio-dev.pid"

  log "starting Studio dev server on port $E2E_STUDIO_PORT"
  (
    cd "$STUDIO_DIR"
    nohup env \
      DATABASE_URL="$DATABASE_URL" \
      HISTORIAN_MCP_BASE_URL="$HISTORIAN_MCP_BASE_URL" \
      HISTORIAN_QDRANT_ENABLED="$HISTORIAN_QDRANT_ENABLED" \
      HISTORIAN_NEO4J_ENABLED="$HISTORIAN_NEO4J_ENABLED" \
      LLM_API_BASE="$LLM_API_BASE" \
      LLM_API_KEY="$LLM_API_KEY" \
      LLM_MODEL="$LLM_MODEL" \
      E2E_REAL_LLM="$E2E_REAL_LLM" \
      npm run dev -- --port "$E2E_STUDIO_PORT" \
      >"$log_file" 2>&1 &
    echo "$!" >"$pid_file"
  )

  wait_http "Studio API" "$E2E_BASE_URL/api/stories" 120
}

run_preflight() {
  log "running real LLM doctor"
  (
    cd "$STUDIO_DIR"
    E2E_REAL_LLM=1 \
      LLM_API_BASE="$LLM_API_BASE" \
      LLM_API_KEY="$LLM_API_KEY" \
      LLM_MODEL="$LLM_MODEL" \
      npm run doctor:llm
  )

  log "running E2E infrastructure doctor"
  (
    cd "$STUDIO_DIR"
    E2E_REAL_LLM=1 \
      DATABASE_URL="$DATABASE_URL" \
      HISTORIAN_MCP_BASE_URL="$HISTORIAN_MCP_BASE_URL" \
      HISTORIAN_QDRANT_ENABLED="$HISTORIAN_QDRANT_ENABLED" \
      HISTORIAN_NEO4J_ENABLED="$HISTORIAN_NEO4J_ENABLED" \
      LLM_API_BASE="$LLM_API_BASE" \
      LLM_API_KEY="$LLM_API_KEY" \
      LLM_MODEL="$LLM_MODEL" \
      E2E_BASE_URL="$E2E_BASE_URL" \
      npm run doctor:e2e-preflight
  )
}

run_tests() {
  log "running Playwright E2E with real local LLM mode"
  (
    cd "$STUDIO_DIR"
    E2E_REAL_LLM=1 \
      E2E_BASE_URL="$E2E_BASE_URL" \
      LLM_API_BASE="$LLM_API_BASE" \
      LLM_API_KEY="$LLM_API_KEY" \
      LLM_MODEL="$LLM_MODEL" \
      npm run test:e2e
  )
}

start_compose_services
start_llm
start_studio
run_preflight

if [[ "$RUN_TESTS" -eq 1 ]]; then
  run_tests
else
  log "stack ready. Run tests with: cd apps/studio && E2E_REAL_LLM=1 npm run test:e2e"
  log "logs: $RUNTIME_DIR"
fi

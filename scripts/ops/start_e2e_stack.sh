#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STUDIO_DIR="$ROOT_DIR/apps/studio"
RUNTIME_DIR="$ROOT_DIR/.runtime/e2e"
mkdir -p "$RUNTIME_DIR"

RUN_TESTS=0
SKIP_LLM=0
SKIP_STUDIO=0
RESET_TIER=0
OWNED_LLM=0
OWNED_STUDIO=0
OWNED_HISTORIAN=0
OWNED_WORKER=0
START_FAILED=0

DOCKER_CMD=()
TIER_FILE="$RUNTIME_DIR/llama-tier.txt"
LLAMA_PID_FILE="$RUNTIME_DIR/llama-server.pid"
STUDIO_PID_FILE="$RUNTIME_DIR/studio-dev.pid"
HISTORIAN_PID_FILE="$RUNTIME_DIR/historian-bridge.pid"
WORKER_PID_FILE="$ROOT_DIR/.runtime/memory_worker.pid"
LLAMA_LOG_FILE="$RUNTIME_DIR/llama-server.log"
STUDIO_LOG_FILE="$RUNTIME_DIR/studio-dev.log"
HISTORIAN_LOG_FILE="$RUNTIME_DIR/historian-bridge.log"
WORKER_LOG_FILE="$ROOT_DIR/.runtime/worker.log"
PYTHON_DEPS_DIR="$RUNTIME_DIR/python-site"

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
    --reset-tier)
      RESET_TIER=1
      shift
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: scripts/ops/start_e2e_stack.sh [--run-tests] [--skip-llm] [--skip-studio] [--reset-tier]

Starts the local real E2E stack:
  - Docker daemon when possible, then Docker Compose services
  - Local llama.cpp OpenAI-compatible server on port 8080
  - Studio dev server on port 3000
  - Real LLM and E2E infrastructure preflight

Environment overrides:
  LLAMA_SERVER_BIN       default: ~/llama.cpp/build/bin/llama-server
  LLAMA_MODEL_PATH       default: ~/models/qwen2.5-7b/model.gguf
  LLAMA_CONTEXT          default tier-specific: 16384,8192,4096,4096
  LLAMA_NGL              default tier-specific: 28,20,12,0
  LLAMA_BATCH            default tier-specific: 512,256,128,64
  LLAMA_THREADS          default: 6, or max(cores-2,4) at CPU tier
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
export DB_DSN="${DB_DSN:-$DATABASE_URL}"
if [[ -z "${MEMORY_WORKER_PYTHON:-}" && -x "$ROOT_DIR/.venv/bin/python3" ]]; then
  export MEMORY_WORKER_PYTHON="$ROOT_DIR/.venv/bin/python3"
fi
if [[ -d "$ROOT_DIR/.venv/lib/python3.12/site-packages" ]]; then
  export PYTHONPATH="$ROOT_DIR/.venv/lib/python3.12/site-packages${PYTHONPATH:+:$PYTHONPATH}"
fi

LLAMA_SERVER_BIN="${LLAMA_SERVER_BIN:-$HOME/llama.cpp/build/bin/llama-server}"
LLAMA_MODEL_PATH="${LLAMA_MODEL_PATH:-$HOME/models/qwen2.5-7b/model.gguf}"
LLAMA_FLASH_ATTN="${LLAMA_FLASH_ATTN:-on}"
LLAMA_HOST="${LLAMA_HOST:-0.0.0.0}"
LLAMA_PORT="${LLAMA_PORT:-8080}"
E2E_STUDIO_PORT="${E2E_STUDIO_PORT:-3000}"
export E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:${E2E_STUDIO_PORT}}"

log() {
  printf '[e2e:start] %s\n' "$*"
}

fail() {
  START_FAILED=1
  printf '[e2e:start] ERROR: %s\n' "$*" >&2
  exit 1
}

ensure_python_worker_deps() {
  local python_bin="${MEMORY_WORKER_PYTHON:-python3}"
  mkdir -p "$PYTHON_DEPS_DIR"
  export PYTHONPATH="$PYTHON_DEPS_DIR${PYTHONPATH:+:$PYTHONPATH}"
  if "$python_bin" -c 'import psycopg2.extras' >/dev/null 2>&1; then
    return
  fi

  log "installing memory worker Python dependencies into $PYTHON_DEPS_DIR"
  "$python_bin" -m pip install --quiet --target "$PYTHON_DEPS_DIR" psycopg2-binary || {
    fail "failed to install psycopg2-binary for memory worker"
  }
  "$python_bin" -c 'import psycopg2.extras' >/dev/null 2>&1 || {
    fail "memory worker Python dependency check failed after install"
  }
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
      return 1
    fi
    sleep 2
  done
  log "$label ready: $url"
}

tail_log() {
  local file="$1"
  local lines="${2:-80}"
  if [[ -f "$file" ]]; then
    tail -n "$lines" "$file" || true
  fi
}

kill_pid_file() {
  local pid_file="$1"
  local label="$2"
  [[ -f "$pid_file" ]] || return 0
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    log "stopping owned $label pid=$pid"
    kill "$pid" >/dev/null 2>&1 || true
    sleep 2
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi
  rm -f "$pid_file"
}

cleanup() {
  local exit_code=$?
  if [[ "$RUN_TESTS" -eq 1 || "$START_FAILED" -eq 1 ]]; then
    [[ "$OWNED_LLM" -eq 1 ]] && kill_pid_file "$LLAMA_PID_FILE" "llama-server"
    [[ "$OWNED_STUDIO" -eq 1 ]] && kill_pid_file "$STUDIO_PID_FILE" "Studio"
    [[ "$OWNED_HISTORIAN" -eq 1 ]] && kill_pid_file "$HISTORIAN_PID_FILE" "Historian bridge"
    [[ "$OWNED_WORKER" -eq 1 ]] && kill_pid_file "$WORKER_PID_FILE" "memory worker"
    if [[ ${#DOCKER_CMD[@]} -gt 0 ]]; then
      compose stop >/dev/null 2>&1 || true
    fi
  fi
  if [[ "$exit_code" -ne 0 ]]; then
    log "llama log tail:"
    tail_log "$LLAMA_LOG_FILE" 60
    log "Studio log tail:"
    tail_log "$STUDIO_LOG_FILE" 60
    log "Historian bridge log tail:"
    tail_log "$HISTORIAN_LOG_FILE" 60
    log "memory worker log tail:"
    tail_log "$WORKER_LOG_FILE" 80
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

port_pid() {
  local port="$1"
  ss -ltnp 2>/dev/null | awk -v port=":$port" '$4 ~ port {print $NF}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1
}

ensure_port_available_or_healthy() {
  local port="$1"
  local health_url="$2"
  local pid_file="$3"
  local label="$4"

  if http_ok "$health_url"; then
    return 0
  fi

  local pid
  pid="$(port_pid "$port")"
  [[ -n "$pid" ]] || return 0

  local owned_pid=""
  [[ -f "$pid_file" ]] && owned_pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ "$pid" == "$owned_pid" ]]; then
    log "killing stale owned $label on port $port pid=$pid"
    kill "$pid" >/dev/null 2>&1 || true
    sleep 2
    kill -9 "$pid" >/dev/null 2>&1 || true
    rm -f "$pid_file"
    return 0
  fi

  fail "port $port is occupied by unknown process pid=$pid; not killing it"
}

free_optional_grafana_port() {
  if [[ "$E2E_STUDIO_PORT" != "3000" || ${#DOCKER_CMD[@]} -eq 0 ]]; then
    return 0
  fi
  if docker_cmd ps --filter "name=novel_grafana" --format '{{.Names}}' 2>/dev/null | grep -qx 'novel_grafana'; then
    log "stopping optional novel_grafana because Studio E2E uses port 3000"
    docker_cmd stop novel_grafana >/dev/null 2>&1 || true
  fi
}

docker_ok() {
  if [[ ${#DOCKER_CMD[@]} -eq 0 ]]; then
    return 1
  fi
  "${DOCKER_CMD[@]}" info >/dev/null 2>&1
}

select_existing_docker() {
  if command -v docker >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
    docker_ok && return 0
  fi

  if command -v docker.exe >/dev/null 2>&1; then
    DOCKER_CMD=(docker.exe)
    docker_ok && return 0
  fi

  DOCKER_CMD=()
  return 1
}

start_docker_daemon() {
  select_existing_docker && return 0

  log "Docker daemon is not ready; attempting platform-aware startup"
  case "$(uname -s)" in
    Linux*)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        if command -v powershell.exe >/dev/null 2>&1; then
          powershell.exe -NoProfile -Command "Start-Process 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'" >/dev/null 2>&1 || true
        fi
      elif command -v systemctl >/dev/null 2>&1; then
        systemctl --user start docker-desktop >/dev/null 2>&1 || true
        if ! select_existing_docker && command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
          sudo systemctl start docker >/dev/null 2>&1 || true
        fi
      fi
      ;;
    Darwin*)
      open -a Docker >/dev/null 2>&1 || true
      ;;
  esac

  local started
  started="$(date +%s)"
  until select_existing_docker; do
    if (( "$(date +%s)" - started >= 180 )); then
      fail "Docker is not reachable after 180s. Start Docker Desktop and enable WSL integration."
    fi
    sleep 3
  done
  log "Docker ready"
}

compose() {
  "${DOCKER_CMD[@]}" compose -f "$ROOT_DIR/infra/docker-compose.yml" "$@"
}

docker_cmd() {
  "${DOCKER_CMD[@]}" "$@"
}

start_compose_services() {
  start_docker_daemon
  log "starting Docker Compose services"
  compose up -d postgres qdrant neo4j

  log "waiting for PostgreSQL"
  local started
  started="$(date +%s)"
  until docker_cmd exec novel_pg pg_isready -U novel -d novel >/dev/null 2>&1; do
    if (( "$(date +%s)" - started >= 120 )); then
      compose logs --tail 80 postgres || true
      fail "PostgreSQL did not become healthy within 120s"
    fi
    sleep 2
  done
  log "PostgreSQL ready"

  wait_http "Qdrant" "http://localhost:6333/healthz" 90 || {
    compose logs --tail 80 qdrant || true
    fail "Qdrant did not become healthy"
  }
  wait_http "Neo4j" "http://localhost:7474" 120 || {
    compose logs --tail 80 neo4j || true
    fail "Neo4j did not become healthy"
  }
  start_historian_bridge
}

start_historian_bridge() {
  if http_ok "$HISTORIAN_MCP_BASE_URL/healthz"; then
    log "Historian bridge already reachable: $HISTORIAN_MCP_BASE_URL"
    return
  fi

  local script="$ROOT_DIR/infra/historian_mcp_bridge.py"
  [[ -f "$script" ]] || fail "Historian bridge script missing: $script"

  ensure_port_available_or_healthy 8090 "$HISTORIAN_MCP_BASE_URL/healthz" "$HISTORIAN_PID_FILE" "Historian bridge"
  : >"$HISTORIAN_LOG_FILE"

  log "starting local Historian bridge on port 8090"
  nohup env \
    HISTORIAN_BRIDGE_HOST=0.0.0.0 \
    HISTORIAN_BRIDGE_PORT=8090 \
    HISTORIAN_QDRANT_URL=http://localhost:6333 \
    HISTORIAN_NEO4J_HTTP_URL=http://localhost:7474/db/neo4j/tx/commit \
    HISTORIAN_NEO4J_USER=neo4j \
    HISTORIAN_NEO4J_PASSWORD=novelgraphpass \
    HISTORIAN_BRIDGE_TIMEOUT_SECONDS=10 \
    python3 "$script" \
    >"$HISTORIAN_LOG_FILE" 2>&1 &
  echo "$!" >"$HISTORIAN_PID_FILE"
  OWNED_HISTORIAN=1

  wait_http "Historian bridge" "$HISTORIAN_MCP_BASE_URL/healthz" 60 || {
    tail_log "$HISTORIAN_LOG_FILE" 100
    fail "Historian bridge did not become healthy"
  }
}

start_memory_worker() {
  local worker_script="$ROOT_DIR/services/memory-bridge/memory_bridge_worker.py"
  local python_bin="${MEMORY_WORKER_PYTHON:-python3}"

  [[ -f "$worker_script" ]] || fail "memory worker script missing: $worker_script"

  if [[ -f "$WORKER_PID_FILE" ]]; then
    local pid
    pid="$(cat "$WORKER_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      log "memory worker already running pid=$pid"
      return
    fi
    rm -f "$WORKER_PID_FILE"
  fi

  local existing_pid
  existing_pid="$(pgrep -f "memory_bridge_worker.py --dsn" | head -n 1 || true)"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" >/dev/null 2>&1; then
    log "memory worker already running pid=$existing_pid"
    echo "$existing_pid" >"$WORKER_PID_FILE"
    return
  fi

  log "starting memory worker with ${python_bin}"
  mkdir -p "$(dirname "$WORKER_LOG_FILE")"
  (
    cd "$ROOT_DIR"
    nohup env \
      DB_DSN="$DB_DSN" \
      DATABASE_URL="$DATABASE_URL" \
      LLM_API_BASE="$LLM_API_BASE" \
      LLM_API_KEY="$LLM_API_KEY" \
      LLM_MODEL="$LLM_MODEL" \
      LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS="$LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS" \
      LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS="$LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS" \
      LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS="$LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS" \
      LLM_TIMEOUT_CHAPTER_REFINE_SECONDS="$LLM_TIMEOUT_CHAPTER_REFINE_SECONDS" \
      LLM_TIMEOUT_NARRATIVE_STYLIST="$LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS" \
      LLM_TIMEOUT_NARRATIVE_CRITIC="$LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS" \
      LLM_TIMEOUT_NARRATIVE_REFINE="$LLM_TIMEOUT_CHAPTER_REFINE_SECONDS" \
      PYTHONUNBUFFERED=1 \
      PYTHONPATH="${PYTHONPATH:-}" \
      "$python_bin" "$worker_script" --dsn "$DB_DSN" \
      >>"$WORKER_LOG_FILE" 2>&1 &
    echo "$!" >"$WORKER_PID_FILE"
  )
  OWNED_WORKER=1
  sleep 1
  if ! kill -0 "$(cat "$WORKER_PID_FILE")" >/dev/null 2>&1; then
    tail_log "$WORKER_LOG_FILE" 100
    fail "memory worker failed to start"
  fi
  log "memory worker started pid=$(cat "$WORKER_PID_FILE")"
}

max_threads() {
  local cores
  cores="$(nproc 2>/dev/null || echo 6)"
  if (( cores > 6 )); then
    echo $((cores - 2))
  else
    echo 4
  fi
}

tier_value() {
  local tier="$1"
  local key="$2"
  case "$tier:$key" in
    0:ngl) echo "${LLAMA_NGL:-28}" ;;
    0:context) echo "${LLAMA_CONTEXT:-16384}" ;;
    0:batch) echo "${LLAMA_BATCH:-512}" ;;
    0:timeout) echo 600 ;;
    1:ngl) echo "${LLAMA_NGL:-20}" ;;
    1:context) echo "${LLAMA_CONTEXT:-8192}" ;;
    1:batch) echo "${LLAMA_BATCH:-256}" ;;
    1:timeout) echo 900 ;;
    2:ngl) echo "${LLAMA_NGL:-12}" ;;
    2:context) echo "${LLAMA_CONTEXT:-4096}" ;;
    2:batch) echo "${LLAMA_BATCH:-128}" ;;
    2:timeout) echo 1200 ;;
    3:ngl) echo "${LLAMA_NGL:-0}" ;;
    3:context) echo "${LLAMA_CONTEXT:-4096}" ;;
    3:batch) echo "${LLAMA_BATCH:-64}" ;;
    3:timeout) echo 1800 ;;
    3:threads) echo "${LLAMA_THREADS:-$(max_threads)}" ;;
    *:threads) echo "${LLAMA_THREADS:-6}" ;;
    *) fail "unknown tier value: $tier $key" ;;
  esac
}

read_tier() {
  if [[ "$RESET_TIER" -eq 1 ]]; then
    echo 0 >"$TIER_FILE"
  fi
  if [[ -f "$TIER_FILE" ]]; then
    local tier
    tier="$(tr -dc '0-3' <"$TIER_FILE" | head -c 1)"
    [[ -n "$tier" ]] && echo "$tier" && return
  fi
  echo 0
}

write_tier() {
  echo "$1" >"$TIER_FILE"
}

export_timeout_budget_for_tier() {
  local tier="$1"
  local timeout
  timeout="$(tier_value "$tier" timeout)"
  export E2E_GENERATION_TIMEOUT_MS="${E2E_GENERATION_TIMEOUT_MS:-$((timeout * 1000))}"
  export LLM_TIMEOUT_CHAPTER_PLAN_SECONDS="${LLM_TIMEOUT_CHAPTER_PLAN_SECONDS:-$timeout}"
  export LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS="${LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS:-$timeout}"
  export LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS="${LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS:-$timeout}"
  export LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS="${LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS:-$timeout}"
  export LLM_TIMEOUT_CHAPTER_REFINE_SECONDS="${LLM_TIMEOUT_CHAPTER_REFINE_SECONDS:-$timeout}"
}

no_gpu_detected() {
  command -v nvidia-smi >/dev/null 2>&1 || return 0
  nvidia-smi >/dev/null 2>&1 || return 0
  return 1
}

llama_oom_detected() {
  [[ -f "$LLAMA_LOG_FILE" ]] || return 1
  grep -Eiq 'out of memory|cuda.*memory|failed to allocate|ggml_cuda.*oom|cuda error|cuda.*oom' "$LLAMA_LOG_FILE"
}

spawn_llama_with_tier() {
  local tier="$1"
  local context ngl batch threads timeout
  context="$(tier_value "$tier" context)"
  ngl="$(tier_value "$tier" ngl)"
  batch="$(tier_value "$tier" batch)"
  threads="$(tier_value "$tier" threads)"
  timeout="$(tier_value "$tier" timeout)"

  ensure_port_available_or_healthy "$LLAMA_PORT" "http://127.0.0.1:${LLAMA_PORT}/health" "$LLAMA_PID_FILE" "llama-server"
  : >"$LLAMA_LOG_FILE"

  log "starting llama.cpp tier=$tier ngl=$ngl context=$context batch=$batch threads=$threads port=$LLAMA_PORT"
  nohup "$LLAMA_SERVER_BIN" \
    -m "$LLAMA_MODEL_PATH" \
    -c "$context" \
    -ngl "$ngl" \
    -b "$batch" \
    -t "$threads" \
    --flash-attn "$LLAMA_FLASH_ATTN" \
    --port "$LLAMA_PORT" \
    --host "$LLAMA_HOST" \
    >"$LLAMA_LOG_FILE" 2>&1 &
  echo "$!" >"$LLAMA_PID_FILE"
  OWNED_LLM=1

  if wait_http "llama.cpp server" "http://127.0.0.1:${LLAMA_PORT}/health" 180; then
    write_tier "$tier"
    export_timeout_budget_for_tier "$tier"
    return 0
  fi

  kill_pid_file "$LLAMA_PID_FILE" "llama-server"
  return 1
}

start_llm() {
  if [[ "$SKIP_LLM" -eq 1 ]]; then
    log "skipping local LLM startup by request"
    return
  fi

  if http_ok "http://127.0.0.1:${LLAMA_PORT}/health" || http_ok "$LLM_API_BASE/models"; then
    log "local LLM already reachable: $LLM_API_BASE"
    export_timeout_budget_for_tier "$(read_tier)"
    return
  fi

  [[ -x "$LLAMA_SERVER_BIN" ]] || fail "llama-server not executable: $LLAMA_SERVER_BIN. Build llama.cpp first."
  [[ -f "$LLAMA_MODEL_PATH" ]] || fail "LLM model file not found: $LLAMA_MODEL_PATH. Download the GGUF model first."

  local tier
  tier="$(read_tier)"
  if no_gpu_detected && (( tier < 3 )); then
    log "no NVIDIA GPU detected; starting from CPU tier 3"
    tier=3
  fi

  while (( tier <= 3 )); do
    if spawn_llama_with_tier "$tier"; then
      return
    fi
    if llama_oom_detected || (( tier < 3 )); then
      log "llama-server failed at tier=$tier; dropping to next tier"
      tier=$((tier + 1))
      write_tier "$tier"
      continue
    fi
    break
  done

  write_tier 3
  fail "llama-server failed through all tiers. Hardware may be insufficient. See $LLAMA_LOG_FILE"
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

  free_optional_grafana_port
  ensure_port_available_or_healthy "$E2E_STUDIO_PORT" "$E2E_BASE_URL/api/stories" "$STUDIO_PID_FILE" "Studio"
  : >"$STUDIO_LOG_FILE"

  log "starting Studio dev server on port $E2E_STUDIO_PORT"
  (
    cd "$STUDIO_DIR"
    nohup env \
      DATABASE_URL="$DATABASE_URL" \
      DB_DSN="$DB_DSN" \
      MEMORY_WORKER_PYTHON="${MEMORY_WORKER_PYTHON:-}" \
      PYTHONPATH="${PYTHONPATH:-}" \
      HISTORIAN_MCP_BASE_URL="$HISTORIAN_MCP_BASE_URL" \
      HISTORIAN_QDRANT_ENABLED="$HISTORIAN_QDRANT_ENABLED" \
      HISTORIAN_NEO4J_ENABLED="$HISTORIAN_NEO4J_ENABLED" \
      LLM_API_BASE="$LLM_API_BASE" \
      LLM_API_KEY="$LLM_API_KEY" \
      LLM_MODEL="$LLM_MODEL" \
      LLM_TIMEOUT_CHAPTER_PLAN_SECONDS="$LLM_TIMEOUT_CHAPTER_PLAN_SECONDS" \
      LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS="$LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS" \
      LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS="$LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS" \
      LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS="$LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS" \
      LLM_TIMEOUT_CHAPTER_REFINE_SECONDS="$LLM_TIMEOUT_CHAPTER_REFINE_SECONDS" \
      E2E_REAL_LLM="$E2E_REAL_LLM" \
      E2E_GENERATION_TIMEOUT_MS="${E2E_GENERATION_TIMEOUT_MS:-600000}" \
      npm run dev -- --hostname 127.0.0.1 --port "$E2E_STUDIO_PORT" \
      >"$STUDIO_LOG_FILE" 2>&1 &
    echo "$!" >"$STUDIO_PID_FILE"
  )
  OWNED_STUDIO=1

  wait_http "Studio API" "$E2E_BASE_URL/api/stories" 120 || {
    tail_log "$STUDIO_LOG_FILE" 100
    fail "Studio API did not become ready"
  }
}

restart_studio_if_needed() {
  if http_ok "$E2E_BASE_URL/api/stories"; then
    return 0
  fi
  kill_pid_file "$STUDIO_PID_FILE" "Studio"
  OWNED_STUDIO=0
  start_studio
}

restart_llm_if_needed() {
  if http_ok "http://127.0.0.1:${LLAMA_PORT}/health"; then
    return 0
  fi
  kill_pid_file "$LLAMA_PID_FILE" "llama-server"
  OWNED_LLM=0
  start_llm
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
      LLM_TIMEOUT_CHAPTER_PLAN_SECONDS="$LLM_TIMEOUT_CHAPTER_PLAN_SECONDS" \
      LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS="$LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS" \
      LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS="$LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS" \
      LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS="$LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS" \
      LLM_TIMEOUT_CHAPTER_REFINE_SECONDS="$LLM_TIMEOUT_CHAPTER_REFINE_SECONDS" \
      npm run doctor:e2e-preflight -- --allow-tier-drop
  )
}

run_tests() {
  local attempt=1
  local max_attempts="${E2E_MAX_TEST_ATTEMPTS:-3}"
  while (( attempt <= max_attempts )); do
    log "running Playwright E2E with real local LLM mode attempt=$attempt/$max_attempts"
    if (
      cd "$STUDIO_DIR"
      E2E_REAL_LLM=1 \
        E2E_BASE_URL="$E2E_BASE_URL" \
        LLM_API_BASE="$LLM_API_BASE" \
        LLM_API_KEY="$LLM_API_KEY" \
        LLM_MODEL="$LLM_MODEL" \
        LLM_TIMEOUT_CHAPTER_PLAN_SECONDS="$LLM_TIMEOUT_CHAPTER_PLAN_SECONDS" \
        LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS="$LLM_TIMEOUT_CHAPTER_WRITE_V3_SECONDS" \
        LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS="$LLM_TIMEOUT_CHAPTER_STYLIST_SECONDS" \
        LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS="$LLM_TIMEOUT_CHAPTER_CRITIC_SECONDS" \
        LLM_TIMEOUT_CHAPTER_REFINE_SECONDS="$LLM_TIMEOUT_CHAPTER_REFINE_SECONDS" \
        E2E_GENERATION_TIMEOUT_MS="${E2E_GENERATION_TIMEOUT_MS:-600000}" \
        npm run test:e2e:real
    ); then
      return 0
    fi

    restart_llm_if_needed || true
    restart_studio_if_needed || true
    attempt=$((attempt + 1))
  done
  fail "Playwright E2E failed after $max_attempts attempts"
}

ensure_python_worker_deps
start_compose_services
start_llm
start_memory_worker
start_studio
run_preflight

if [[ "$RUN_TESTS" -eq 1 ]]; then
  run_tests
else
  log "stack ready. Run tests with: cd apps/studio && npm run test:e2e:real"
  log "logs: $RUNTIME_DIR"
fi

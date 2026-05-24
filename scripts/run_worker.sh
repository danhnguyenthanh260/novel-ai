#!/bin/bash

# Script tiện ích để chạy worker trực tiếp trên terminal với môi trường chuẩn
set -a
source /home/danh/novel-ai/apps/studio/.env.local
set +a
export DATABASE_URL
export DB_DSN=$DATABASE_URL

echo "[script] Starting standalone worker... (Press Ctrl+C to stop)"
/home/danh/novel-ai/.venv/bin/python3 /home/danh/novel-ai/services/memory-bridge/memory_bridge_worker.py "$@"

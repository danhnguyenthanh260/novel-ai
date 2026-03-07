#!/bin/bash
# Run Moltbook Agent
# Usage: ./scripts/moltbook_run.sh

export PYTHONPATH=$(pwd)
python3 -m services.moltbook.loop

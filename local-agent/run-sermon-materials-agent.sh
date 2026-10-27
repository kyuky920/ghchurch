#!/bin/sh

set -eu

NODE24_BIN="/opt/homebrew/opt/node@24/bin/node"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ ! -x "$NODE24_BIN" ]; then
  echo "Node 24 executable not found: $NODE24_BIN" >&2
  echo "Install it with: brew install node@24" >&2
  exit 1
fi

exec "$NODE24_BIN" "$SCRIPT_DIR/sermon-materials-agent.mjs" "$@"

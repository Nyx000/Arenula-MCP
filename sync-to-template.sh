#!/bin/bash
# Sync all arenula-mcp components → arenula-template
# Syncs: Editor (C#), API (Node), Docs (Node)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="${1:-C:/Users/husen/Documents/Projects/arenula/Libraries/arenula_mcp}"

if [ ! -d "$TEMPLATE/Editor" ]; then
    echo "ERROR: Template not found at $TEMPLATE"; exit 1
fi

echo "=== Syncing arenula-mcp → arenula-template ==="

# Editor C#
echo "  Editor..."
rm -rf "$TEMPLATE/Editor/Core" "$TEMPLATE/Editor/Handlers"
cp -r "$SCRIPT_DIR/editor/Editor/Core" "$TEMPLATE/Editor/Core"
cp -r "$SCRIPT_DIR/editor/Editor/Handlers" "$TEMPLATE/Editor/Handlers"

# API server (source only — no node_modules or dist)
echo "  API..."
rm -rf "$TEMPLATE/api/src"
cp -r "$SCRIPT_DIR/api/src" "$TEMPLATE/api/src"
cp "$SCRIPT_DIR/api/package.json" "$TEMPLATE/api/package.json"
cp "$SCRIPT_DIR/api/package-lock.json" "$TEMPLATE/api/package-lock.json" 2>/dev/null
cp "$SCRIPT_DIR/api/tsconfig.json" "$TEMPLATE/api/tsconfig.json"

# Docs server (source only)
echo "  Docs..."
rm -rf "$TEMPLATE/docs/src"
cp -r "$SCRIPT_DIR/docs/src" "$TEMPLATE/docs/src"
cp "$SCRIPT_DIR/docs/package.json" "$TEMPLATE/docs/package.json"
cp "$SCRIPT_DIR/docs/package-lock.json" "$TEMPLATE/docs/package-lock.json" 2>/dev/null
cp "$SCRIPT_DIR/docs/tsconfig.json" "$TEMPLATE/docs/tsconfig.json"

echo "Done. Now commit in arenula-template."

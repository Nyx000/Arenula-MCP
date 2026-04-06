#!/bin/bash
# Sync Arenula MCP editor code from this repo to the junkyard project.
# Run from the Arenula-MCP repo root, or it auto-detects.
#
# Usage:  ./sync-to-junkyard.sh
#         ./sync-to-junkyard.sh /path/to/junkyard

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/editor/Editor"
DEST="${1:-C:/Users/husen/Documents/Projects/junkyard/Libraries/arenula_mcp/Editor}"

if [ ! -d "$SRC/Core" ] || [ ! -d "$SRC/Handlers" ]; then
    echo "ERROR: Source not found at $SRC"
    exit 1
fi

if [ ! -d "$DEST" ]; then
    echo "ERROR: Destination not found at $DEST"
    exit 1
fi

echo "Syncing Arenula MCP editor code..."
echo "  From: $SRC"
echo "  To:   $DEST"

# Use rsync if available, otherwise fall back to cp
if command -v rsync &>/dev/null; then
    rsync -av --delete "$SRC/Core/" "$DEST/Core/"
    rsync -av --delete "$SRC/Handlers/" "$DEST/Handlers/"
else
    rm -rf "$DEST/Core" "$DEST/Handlers"
    cp -r "$SRC/Core" "$DEST/Core"
    cp -r "$SRC/Handlers" "$DEST/Handlers"
fi

echo "Done. Core and Handlers synced."

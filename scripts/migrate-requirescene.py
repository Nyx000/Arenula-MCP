#!/usr/bin/env python3
"""Migrate sub-method scene resolves to HandlerBase.RequireScene.

Pattern (3 lines collapsed to 1):
  var scene = SceneHelpers.ResolveScene();
  if ( scene == null )
      return HandlerBase.Error( "No active scene.", "action_name" );
  -->
  var scene = HandlerBase.RequireScene( "action_name" );

The throw from RequireScene is caught by the handler's top-level try/catch
and converted to HandlerBase.Error. Same user-visible error response.

Intentionally NOT migrated:
- Handle()-top resolves where the action is a *variable* (not a string
  literal) — e.g. TerrainHandler. These sit outside the try/catch and
  would leak InvalidOperationException to RpcDispatcher; they need a
  structural refactor (Card 9) first.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# Match: indent + resolve + null-check + Error-return with a STRING LITERAL
# action name. Variable-action forms are left alone intentionally.
PATTERN = re.compile(
    r"(?P<indent>[ \t]+)var scene = SceneHelpers\.ResolveScene\(\s*\);\r?\n"
    r"(?P=indent)if \(\s*scene == null\s*\)\r?\n"
    r"(?P=indent)[ \t]+return HandlerBase\.Error\(\s*\"No active scene[^\"]*\"\s*,\s*"
    r"\"(?P<action>[^\"]+)\"[^)]*\);",
    re.MULTILINE,
)


def repl(m: re.Match) -> str:
    return f'{m.group("indent")}var scene = HandlerBase.RequireScene( "{m.group("action")}" );'


def discover(root: Path) -> list[Path]:
    return sorted((root / "editor").rglob("*.cs"))


def main() -> int:
    base = Path(__file__).resolve().parent.parent
    grand = 0
    for path in discover(base):
        original = path.read_text(encoding="utf-8")
        new, n = PATTERN.subn(repl, original)
        if n:
            path.write_text(new, encoding="utf-8")
            rel = path.relative_to(base).as_posix()
            print(f"  {rel}: {n}")
            grand += n
    print(f"\nTotal: {grand} sites migrated")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Migrate the scene.CreateObject + Name + WorldPosition (+ WorldRotation) ritual
to SceneHelpers.CreateChildObject.

Two patterns handled:

  # No rotation (collapse 3 lines to 1):
  var go = scene.CreateObject();
  go.Name = HandlerBase.GetString( args, "name" ) ?? "Default";
  go.WorldPosition = position;
  -->
  var go = SceneHelpers.CreateChildObject( scene, args, "Default", position );

  # With rotation immediately after (collapse 4 lines to 1):
  var go = scene.CreateObject();
  go.Name = HandlerBase.GetString( args, "name" ) ?? "Default";
  go.WorldPosition = position;
  go.WorldRotation = rotation;
  -->
  var go = SceneHelpers.CreateChildObject( scene, args, "Default", position, rotation );

The pattern must match with a `var go =` declaration (not `sun =` or similar).
Order must be Name → Position → (optional) Rotation, with `position` as the RHS.
Edge cases (non-go variable names, out-of-order, different defaults) are skipped.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# WITH rotation — try first so the no-rotation pattern doesn't eat the rotation line
WITH_ROTATION = re.compile(
    r"(?P<indent>[ \t]+)"
    r"var go = scene\.CreateObject\(\s*\);\r?\n"
    r"(?P=indent)go\.Name = HandlerBase\.GetString\(\s*args,\s*\"name\"\s*\)\s*\?\?\s*\"(?P<default>[^\"]+)\";\r?\n"
    r"(?P=indent)go\.WorldPosition = (?P<pos>[A-Za-z_][\w.]*);\r?\n"
    r"(?P=indent)go\.WorldRotation = (?P<rot>[A-Za-z_][\w.]*);",
    re.MULTILINE,
)

NO_ROTATION = re.compile(
    r"(?P<indent>[ \t]+)"
    r"var go = scene\.CreateObject\(\s*\);\r?\n"
    r"(?P=indent)go\.Name = HandlerBase\.GetString\(\s*args,\s*\"name\"\s*\)\s*\?\?\s*\"(?P<default>[^\"]+)\";\r?\n"
    r"(?P=indent)go\.WorldPosition = (?P<pos>[A-Za-z_][\w.]*);",
    re.MULTILINE,
)


def repl_with_rotation(m: re.Match) -> str:
    ind, default, pos, rot = m.group("indent"), m.group("default"), m.group("pos"), m.group("rot")
    return f'{ind}var go = SceneHelpers.CreateChildObject( scene, args, "{default}", {pos}, {rot} );'


def repl_no_rotation(m: re.Match) -> str:
    ind, default, pos = m.group("indent"), m.group("default"), m.group("pos")
    return f'{ind}var go = SceneHelpers.CreateChildObject( scene, args, "{default}", {pos} );'


def process(content: str) -> tuple[str, int, int]:
    new, n1 = WITH_ROTATION.subn(repl_with_rotation, content)
    new, n2 = NO_ROTATION.subn(repl_no_rotation, new)
    return new, n1, n2


def discover(root: Path) -> list[Path]:
    return sorted((root / "editor").rglob("*.cs"))


def main() -> int:
    base = Path(__file__).resolve().parent.parent
    g_with, g_no = 0, 0
    for path in discover(base):
        original = path.read_text(encoding="utf-8")
        new, n_with, n_no = process(original)
        total = n_with + n_no
        if total:
            path.write_text(new, encoding="utf-8")
            rel = path.relative_to(base).as_posix()
            bits = []
            if n_with: bits.append(f"with_rot={n_with}")
            if n_no: bits.append(f"no_rot={n_no}")
            print(f"  {rel}: {total}  ({', '.join(bits)})")
            g_with += n_with
            g_no += n_no
    print(f"\nTotal: with_rot={g_with}, no_rot={g_no} — {g_with + g_no} sites migrated")
    return 0


if __name__ == "__main__":
    sys.exit(main())

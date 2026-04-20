#!/usr/bin/env python3
"""Remove `/// Ported from X` and `// Ported from X` provenance comments.

Handles the single-line case and the PrefabHandler multi-line case where
the sentence continues on subsequent /// lines until one ends in '.'.

Usage: python scripts/strip-ported-comments.py
"""
from __future__ import annotations

import sys
from pathlib import Path

def discover_cs_files(root: "Path") -> list["Path"]:
    """All *.cs files under editor/ — easier than maintaining a hand list."""
    return sorted((root / "editor").rglob("*.cs"))


def strip(content: str) -> tuple[str, int]:
    lines = content.splitlines(keepends=True)
    out: list[str] = []
    i = 0
    removed = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.lstrip()
        is_ported = stripped.startswith("/// Ported from") or stripped.startswith(
            "// Ported from"
        )
        if not is_ported:
            out.append(line)
            i += 1
            continue

        # Skip this line.
        removed += 1
        if "." in line.rstrip("\r\n"):
            i += 1
            continue

        # Multi-line sentence: skip continuation `///` lines until one ends in '.'
        # or we hit something that isn't a doc-comment continuation.
        i += 1
        while i < len(lines):
            cont_stripped = lines[i].lstrip()
            is_doc_continuation = (
                cont_stripped.startswith("///")
                and not cont_stripped.startswith("/// <")
                and not cont_stripped.startswith("/// </")
            )
            if not is_doc_continuation:
                break
            removed += 1
            ends_with_period = "." in lines[i].rstrip("\r\n")
            i += 1
            if ends_with_period:
                break
    return "".join(out), removed


def main() -> int:
    base = Path(__file__).resolve().parent.parent
    total = 0
    for path in discover_cs_files(base):
        original = path.read_text(encoding="utf-8")
        new, n = strip(original)
        if n > 0:
            path.write_text(new, encoding="utf-8")
            rel = path.relative_to(base).as_posix()
            print(f"  {rel}: removed {n}")
            total += n
    print(f"\nTotal removed: {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

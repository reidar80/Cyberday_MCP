"""Read-only probe for undocumented Cyberday /api/external/* endpoints.

Usage:
    set CYBERDAY_API_KEY=...
    python scripts/probe.py

The script only issues GET requests. Results are appended to
docs/discovery.md.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx

BASE = os.environ.get("CYBERDAY_BASE_URL", "https://dash.appcover.com").rstrip("/")
KEY = os.environ.get("CYBERDAY_API_KEY")

# Candidate ISMS resources, modelled on the documented systems/topics/.
CANDIDATES: list[str] = [
    "/api/external/systems/topics/",  # known good — sanity check
    "/api/external/providers/",
    "/api/external/providers/topics/",
    "/api/external/databanks/",
    "/api/external/databanks/topics/",
    "/api/external/datasets/",
    "/api/external/datasources/",
    "/api/external/risks/",
    "/api/external/risks/topics/",
    "/api/external/tasks/",
    "/api/external/tasks/topics/",
    "/api/external/policies/",
    "/api/external/employees/",
    "/api/external/users/",
    "/api/external/incidents/",
    "/api/external/units/",
    "/api/external/frameworks/",
    "/api/external/assets/",
    "/api/external/processes/",
    "/api/external/documents/",
    "/api/external/audit-logs/",
]


def shape_of(value: object, depth: int = 0) -> str:
    if depth > 1:
        return "..."
    if isinstance(value, list):
        if not value:
            return "[]"
        return f"[{shape_of(value[0], depth + 1)}]"
    if isinstance(value, dict):
        keys = list(value.keys())[:6]
        return "{" + ", ".join(keys) + ("..." if len(value) > 6 else "") + "}"
    return type(value).__name__


def main() -> int:
    if not KEY:
        print("CYBERDAY_API_KEY is not set", file=sys.stderr)
        return 1

    rows: list[tuple[str, int, str]] = []
    with httpx.Client(
        base_url=BASE,
        headers={"GROUP-API-KEY": KEY, "Accept": "application/json"},
        timeout=15.0,
    ) as http:
        for path in CANDIDATES:
            try:
                r = http.get(path)
            except httpx.HTTPError as e:
                rows.append((path, -1, f"transport error: {e}"))
                continue
            note = ""
            if r.is_success:
                try:
                    note = shape_of(r.json())
                except Exception:
                    note = f"non-json {len(r.content)} bytes"
            else:
                note = (r.text or "")[:80].replace("\n", " ")
            rows.append((path, r.status_code, note))
            print(f"{r.status_code:>4} {path}  {note}")

    out = Path(__file__).resolve().parent.parent / "docs" / "discovery.md"
    lines = [
        "# Cyberday API discovery log",
        "",
        "Findings from probing `https://dash.appcover.com/api/external/*` with a real API key.",
        "",
        "## Probe results",
        "",
        "| Path | Status | Shape / note |",
        "|------|--------|--------------|",
    ]
    for path, status, note in rows:
        lines.append(f"| `{path}` | {status} | {note} |")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nWrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

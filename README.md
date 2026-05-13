# cyberday-mcp

Community MCP server for [Cyberday](https://cyberday.ai) — the Agendium Ltd information security management system.

Exposes the Cyberday "external systems" API as MCP tools, so AI assistants like Claude can list and write to your data‑system inventory.

> Cyberday is building its own official MCP layer (announced in their ISMS workflows webinar). This is a community implementation that works against the same public REST API today.

## Tools

| Tool | What it does |
|------|--------------|
| `list_systems` | Returns every data system in your Cyberday org. |
| `create_system` | Creates a new system from just a title. |
| `create_or_update_system_advanced` | Upserts a system with nickname, owner, admin, cost center, purpose, linked systems and linked providers. |

## API surface used

| Method | Path | Source |
|--------|------|--------|
| `GET` | `https://dash.appcover.com/api/external/systems/topics/` | Microsoft connector swagger |
| `POST` | `https://dash.appcover.com/api/external/systems/topics/` | Microsoft connector swagger |
| `POST` | `https://dash.appcover.com/api/external/systems/topics/advanced/` | Microsoft connector swagger |

Auth is the header `GROUP-API-KEY: <your org key>`. Throttle: 100 calls / 60 seconds.

## Getting an API key

Inside Cyberday, sign in as an admin user, then:

1. **Settings** → expand **Integration settings**
2. Toggle **API Access** to ON
3. Copy the key shown

## Install

```bash
cd cyberday-mcp
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -e .[dev]
```

## Run

```bash
$env:CYBERDAY_API_KEY="..."     # PowerShell
# export CYBERDAY_API_KEY=...   # bash
python -m cyberday_mcp
```

## Claude Desktop config

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cyberday": {
      "command": "python",
      "args": ["-m", "cyberday_mcp"],
      "env": {
        "CYBERDAY_API_KEY": "your-org-api-key"
      }
    }
  }
}
```

## Test

```bash
pytest
```

## MCP Inspector (interactive smoke test)

```bash
mcp dev src/cyberday_mcp/server.py
```

## Discovering undocumented endpoints

A read-only probe script lives at `scripts/probe.py`. It queries plausible
sibling paths under `/api/external/` and writes findings to
`docs/discovery.md`. Run it once you have a non-production API key:

```bash
python scripts/probe.py
```

It never sends `POST`/`PUT`/`DELETE`.

## References

- [Microsoft Learn — Cyberday connector](https://learn.microsoft.com/en-us/connectors/cyberday/)
- [Cyberday connector swagger](https://github.com/microsoft/PowerPlatformConnectors/tree/dev/certified-connectors/Cyberday)
- [Model Context Protocol Python SDK](https://github.com/modelcontextprotocol/python-sdk)

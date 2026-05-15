# mcp-server-cyberday

Community MCP server for [Cyberday](https://cyberday.ai) — the Agendium Ltd information security management system.

Exposes the Cyberday "external systems" API as MCP tools so AI assistants like Claude Desktop can list and write to your data-system inventory.

> Cyberday is building its own official MCP layer (announced in their ISMS workflows webinar). This is a community implementation that works against the same public REST API today.

## Tools

| Tool | What it does |
|------|--------------|
| `list_systems` | Returns every data system in your Cyberday org. |
| `create_system` | Creates a new system from just a title. |
| `create_or_update_system_advanced` | Upserts a system with nickname, owner, admin, cost center, purpose, linked systems and linked providers. |

## Quick start with Claude Desktop

Add this to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "cyberday": {
      "command": "npx",
      "args": ["-y", "mcp-server-cyberday"],
      "env": {
        "CYBERDAY_API_KEY": "your-org-api-key"
      }
    }
  }
}
```

Restart Claude Desktop. The three Cyberday tools should appear in the tools menu.

Equivalent config for Claude Code:

```bash
claude mcp add cyberday -- npx -y mcp-server-cyberday
```

…then set `CYBERDAY_API_KEY` in the same shell.

## Environment variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `CYBERDAY_API_KEY` | yes | — | Org-level key from Settings → Integration settings → API Access. |
| `CYBERDAY_BASE_URL` | no | `https://dash.appcover.com` | Override only if Cyberday tells you to. |
| `CYBERDAY_TIMEOUT` | no | `30` | HTTP timeout in seconds. |

## Getting an API key

Inside Cyberday, sign in as an admin user, then:

1. **Settings** → expand **Integration settings**
2. Toggle **API Access** to ON
3. Copy the key shown

Auth is the header `GROUP-API-KEY: <your org key>`. Throttle: 100 calls / 60 seconds.

## API surface used

| Method | Path | Source |
|--------|------|--------|
| `GET` | `https://dash.appcover.com/api/external/systems/topics/` | Microsoft connector swagger |
| `POST` | `https://dash.appcover.com/api/external/systems/topics/` | Microsoft connector swagger |
| `POST` | `https://dash.appcover.com/api/external/systems/topics/advanced/` | Microsoft connector swagger |

## Developing

```bash
npm install
npm run build
CYBERDAY_API_KEY=... node dist/index.js
```

The compiled binary speaks MCP over stdio, so you can wire it into any MCP client that supports the stdio transport.

## Discovering undocumented endpoints (production-safe)

Cyberday's public OpenAPI surface (the Microsoft Power Platform connector) only documents three operations on `/api/external/systems/topics/`. The real API almost certainly has more — providers, risks, tasks, frameworks, employees, etc. — but Cyberday has not published a spec for them.

If you only have a production API key, you can run a hardened, read-only prober against your own org:

```bash
# Step 1 — HEAD only, no bodies fetched. Run this first.
CYBERDAY_API_KEY=... node scripts/discover.mjs

# Step 2 — for paths that returned 2xx/4xx in step 1, fetch one GET each and
# record only the top-level JSON key names. Requires --i-understand to
# acknowledge that this issues GETs against production.
CYBERDAY_API_KEY=... node scripts/discover.mjs --shape --i-understand
```

Safety properties of `scripts/discover.mjs`:

- Default mode is `HEAD` — no response bodies are read, so no customer data is captured.
- Throttled to one request every 2.5s (`~24/min` vs the documented `100/60s` limit). Tunable with `--throttle-ms`.
- Confirm-before-run prompt shows the target host, sha256 fingerprint of the API key, path count, and estimated runtime; waits for `yes` on stdin.
- `--shape` mode captures **top-level key names only** — never values. Error-response snippets are truncated to 256 chars with emails and UUIDs regex-redacted.
- Halts on `429` or `5xx`.
- Output goes to `.discovery/` (gitignored). Review before committing anything.

Use `--dry-run` to print the plan without sending any requests.

## Legacy Python implementation

The original Python implementation still lives in [`python/`](./python/) for users who prefer running with `python -m cyberday_mcp`. The TypeScript build in this directory is the canonical NPM distribution.

## References

- [Microsoft Learn — Cyberday connector](https://learn.microsoft.com/en-us/connectors/cyberday/)
- [Cyberday connector swagger](https://github.com/microsoft/PowerPlatformConnectors/tree/dev/certified-connectors/Cyberday)
- [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

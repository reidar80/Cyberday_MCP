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

## Legacy Python implementation

The original Python implementation still lives in [`python/`](./python/) for users who prefer running with `python -m cyberday_mcp`. The TypeScript build in this directory is the canonical NPM distribution.

## References

- [Microsoft Learn — Cyberday connector](https://learn.microsoft.com/en-us/connectors/cyberday/)
- [Cyberday connector swagger](https://github.com/microsoft/PowerPlatformConnectors/tree/dev/certified-connectors/Cyberday)
- [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

#!/usr/bin/env node
/**
 * MCP server entry — stdio transport, three Cyberday tools.
 *
 * Run via `npx -y mcp-server-cyberday` after publishing, or via
 * `node dist/index.js` locally. `CYBERDAY_API_KEY` must be set in the
 * environment.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { CyberdayClient } from "./client.js";
import { loadSettings } from "./config.js";

const PACKAGE_NAME = "mcp-server-cyberday";
const PACKAGE_VERSION = "0.1.0";

function makeClient(): CyberdayClient {
  const settings = loadSettings();
  return new CyberdayClient({
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    timeoutMs: settings.timeoutMs,
  });
}

/** Format any thrown value as a JSON-content MCP tool error response. */
function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

const server = new McpServer({
  name: PACKAGE_NAME,
  version: PACKAGE_VERSION,
});

server.registerTool(
  "list_systems",
  {
    title: "List Cyberday systems",
    description:
      "List every data system in the current Cyberday organisation. " +
      "Returns each system's id, title, description, assigned user, " +
      "workflow status, importance, dates, and the dynamic " +
      "`text___system-template-*` fields that Cyberday attaches. " +
      "Use this to read inventory; it does not modify anything.",
    inputSchema: {},
  },
  async () => {
    try {
      const client = makeClient();
      const systems = await client.listSystems();
      return jsonResult(systems);
    } catch (err) {
      return toolError(err);
    }
  },
);

server.registerTool(
  "create_system",
  {
    title: "Create Cyberday system",
    description:
      "Create a new Cyberday data system with just a title. Returns " +
      '`{ "id": number, "title": string }` for the new system. Use this ' +
      "when you only know the system name and want Cyberday to fill the " +
      "rest from its template. For richer creation use " +
      "`create_or_update_system_advanced`.",
    inputSchema: {
      title: z.string().min(1).describe("Title of the new system"),
    },
  },
  async ({ title }) => {
    try {
      const client = makeClient();
      const ref = await client.createSystem(title);
      return jsonResult(ref);
    } catch (err) {
      return toolError(err);
    }
  },
);

server.registerTool(
  "create_or_update_system_advanced",
  {
    title: "Create or update Cyberday system (advanced)",
    description:
      "Create or update a Cyberday data system with detail fields. " +
      "`title` is required and acts as the upsert key — calling this " +
      "with an existing system title updates that system; a new title " +
      "creates one. All other fields are optional; pass only what you have.",
    inputSchema: {
      title: z.string().min(1).describe("Upsert key — system title"),
      nickname: z
        .string()
        .optional()
        .describe("Short alternative name (`additional-name`)"),
      owner: z
        .string()
        .optional()
        .describe("Business owner of the data system (`additional-owner`)"),
      administrator: z
        .string()
        .optional()
        .describe("Technical admin (`additional-admin`)"),
      cost_center: z
        .string()
        .optional()
        .describe("Chargeback / budgeting code (`additional-cost`)"),
      linked_systems: z
        .array(z.string())
        .optional()
        .describe("Titles of other Cyberday systems this one connects to"),
      purpose: z
        .string()
        .optional()
        .describe("Business purpose of the system (`units-purpose`)"),
      linked_providers: z
        .array(z.string())
        .optional()
        .describe("Provider names processing data for this system"),
      partner_resp_text: z
        .string()
        .optional()
        .describe("Free-text on partner responsibilities"),
    },
  },
  async (args) => {
    try {
      const client = makeClient();
      const { title, ...rest } = args;
      const result = await client.createOrUpdateSystemAdvanced(title, rest);
      return jsonResult(result);
    } catch (err) {
      return toolError(err);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // Stdio transport uses stdout for protocol traffic; errors must go to stderr.
  process.stderr.write(
    `[${PACKAGE_NAME}] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});

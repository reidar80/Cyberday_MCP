/**
 * Runtime configuration sourced from environment variables. Mirrors the
 * Python `Settings` model in `python/src/cyberday_mcp/config.py`.
 */

export interface Settings {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

const DEFAULT_BASE_URL = "https://dash.appcover.com";
const DEFAULT_TIMEOUT_SECONDS = 30;

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const apiKey = env.CYBERDAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "CYBERDAY_API_KEY is required. Set it in your MCP client config " +
        "(e.g. Claude Desktop `env` block) or in your shell.",
    );
  }

  const baseUrl = env.CYBERDAY_BASE_URL?.trim() || DEFAULT_BASE_URL;

  const timeoutRaw = env.CYBERDAY_TIMEOUT?.trim();
  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
  if (timeoutRaw) {
    const parsed = Number(timeoutRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `CYBERDAY_TIMEOUT must be a positive number, got: ${timeoutRaw}`,
      );
    }
    timeoutSeconds = parsed;
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    timeoutMs: timeoutSeconds * 1000,
  };
}

/**
 * Async client for the Cyberday "external systems" API. Mirrors the
 * Python `CyberdayClient`. Uses Node 18+ global `fetch` so we have no
 * runtime dependency beyond the MCP SDK + zod.
 */

import {
  buildAdvancedBody,
  type AdvancedSystemInput,
  type System,
  type SystemRef,
} from "./models.js";

export class CyberdayError extends Error {
  readonly statusCode?: number;
  readonly body?: unknown;
  constructor(message: string, statusCode?: number, body?: unknown) {
    super(message);
    this.name = "CyberdayError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

export class CyberdayAuthError extends CyberdayError {
  constructor(message: string, statusCode?: number, body?: unknown) {
    super(message, statusCode, body);
    this.name = "CyberdayAuthError";
  }
}

export class CyberdayRateLimitError extends CyberdayError {
  constructor(message: string, statusCode?: number, body?: unknown) {
    super(message, statusCode, body);
    this.name = "CyberdayRateLimitError";
  }
}

export class CyberdayAPIError extends CyberdayError {
  constructor(message: string, statusCode?: number, body?: unknown) {
    super(message, statusCode, body);
    this.name = "CyberdayAPIError";
  }
}

export interface CyberdayClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Inject a custom fetch (used in tests). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

export class CyberdayClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CyberdayClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://dash.appcover.com").replace(
      /\/+$/,
      "",
    );
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listSystems(): Promise<System[]> {
    const response = await this.request("GET", "/api/external/systems/topics/");
    const payload = await this.readJson(response);
    if (!Array.isArray(payload)) {
      throw new CyberdayAPIError(
        `Expected list response, got ${typeof payload}`,
        response.status,
        payload,
      );
    }
    return payload as System[];
  }

  async createSystem(title: string): Promise<SystemRef> {
    const response = await this.request(
      "POST",
      "/api/external/systems/topics/",
      { title },
    );
    return (await this.readJson(response)) as SystemRef;
  }

  async createOrUpdateSystemAdvanced(
    title: string,
    input: AdvancedSystemInput,
  ): Promise<Record<string, unknown>> {
    const body = buildAdvancedBody(title, input);
    const response = await this.request(
      "POST",
      "/api/external/systems/topics/advanced/",
      body,
    );
    const text = await response.text();
    if (!text) return { status: "ok" };
    try {
      return JSON.parse(text);
    } catch {
      return { status: "ok", raw: text };
    }
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          "GROUP-API-KEY": this.apiKey,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new CyberdayError(
          `Cyberday API ${method} ${url} timed out after ${this.timeoutMs}ms`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let parsedBody: unknown;
      const text = await response.text();
      try {
        parsedBody = text ? JSON.parse(text) : text;
      } catch {
        parsedBody = text;
      }
      const message = `Cyberday API ${method} ${url} → ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        throw new CyberdayAuthError(message, response.status, parsedBody);
      }
      if (response.status === 429) {
        throw new CyberdayRateLimitError(message, response.status, parsedBody);
      }
      throw new CyberdayAPIError(message, response.status, parsedBody);
    }

    return response;
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new CyberdayAPIError(
        `Failed to parse JSON: ${(err as Error).message}`,
        response.status,
        text,
      );
    }
  }
}

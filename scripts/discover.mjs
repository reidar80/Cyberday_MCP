#!/usr/bin/env node
/**
 * Production-safe probe for undocumented Cyberday API endpoints.
 *
 * # Why a new prober?
 *
 * The legacy `python/scripts/probe.py` hammers the API as fast as `httpx`
 * can send GETs and records full error-body snippets. That's fine against
 * a sandbox; it's not fine against production. This script is designed for
 * the case where you only have a real org API key.
 *
 * # Safety properties
 *
 * 1. **HEAD by default.** Default mode issues only HEAD requests — these
 *    return status + headers but no body, so no customer data is ever
 *    captured. Run this first.
 *
 * 2. **GET requires explicit opt-in.** Re-running with `--shape
 *    --i-understand` does a single GET per path and records only the
 *    **top-level JSON key names** of the response (no values). Error
 *    response bodies are truncated to 256 chars with emails and UUIDs
 *    regex-redacted.
 *
 * 3. **Throttle.** Default 2500ms between requests (~24/min). The
 *    documented Cyberday connector limit is 100/60s, so this stays at
 *    roughly 25% of the cap, leaving headroom for the user's normal
 *    traffic.
 *
 * 4. **Confirm-before-run.** Prints target host, sha256 fingerprint of
 *    the API key (first 12 chars only), path count, and estimated runtime,
 *    then waits for `yes` on stdin.
 *
 * 5. **Output goes to `.discovery/`** which is in `.gitignore`. You review
 *    before committing anything.
 *
 * 6. **Halts on 429 or 5xx.** If Cyberday throttles us or returns a server
 *    error, we stop immediately rather than retrying.
 *
 * # Usage
 *
 *   # Discover which paths exist (HEAD only, no bodies fetched)
 *   CYBERDAY_API_KEY=... node scripts/discover.mjs
 *
 *   # Print the plan without sending anything
 *   CYBERDAY_API_KEY=... node scripts/discover.mjs --dry-run
 *
 *   # For paths that returned 2xx/4xx in HEAD mode, fetch a sample and
 *   # record top-level shape. Requires --i-understand to acknowledge that
 *   # this issues GETs against production.
 *   CYBERDAY_API_KEY=... node scripts/discover.mjs --shape --i-understand
 *
 *   # Probe a custom list (one path per line, # comments allowed)
 *   CYBERDAY_API_KEY=... node scripts/discover.mjs --paths-file ./my-paths.txt
 *
 *   # Slower throttle (e.g. 5s between requests)
 *   CYBERDAY_API_KEY=... node scripts/discover.mjs --throttle-ms 5000
 */

import { createInterface } from "node:readline/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
const BASE = (process.env.CYBERDAY_BASE_URL ?? "https://dash.appcover.com").replace(
  /\/+$/,
  "",
);
const KEY = process.env.CYBERDAY_API_KEY;
const THROTTLE_MS = Number(args["throttle-ms"] ?? 2500);
const PATHS_FILE = args["paths-file"] ?? null;
const MODE = args["dry-run"]
  ? "dry-run"
  : args.shape
    ? "shape"
    : "head";

// Resources guessed from Cyberday UI nomenclature. Sibling paths under
// /api/external/ that *might* exist but aren't in the Microsoft connector
// spec. Tweak this list or use --paths-file to extend.
const DEFAULT_CANDIDATES = [
  "/api/external/systems/topics/", // known good — sanity check
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
  "/api/external/incidents/topics/",
  "/api/external/units/",
  "/api/external/frameworks/",
  "/api/external/assets/",
  "/api/external/processes/",
  "/api/external/documents/",
  "/api/external/audit-logs/",
  "/api/external/agreements/",
  "/api/external/personnel-groups/",
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i];
    } else {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

/** Show only the first 12 hex chars of the key's sha256 — useful to confirm
 *  which key was used without leaking it into logs or markdown output. */
function keyFingerprint(key) {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

/** Redact emails and UUIDs from any short snippet captured from an error
 *  response. Always truncates to 256 chars. */
function redact(text) {
  if (typeof text !== "string") return String(text ?? "");
  return text
    .slice(0, 256)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "<redacted-uuid>",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Produce a short shape signature: top-level keys for objects, element
 *  shape + length for arrays, scalar type otherwise. Records NO values. */
function shapeOf(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${shapeOf(value[0])}] (len=${value.length})`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    const shown = keys.slice(0, 8);
    return `{ ${shown.join(", ")}${keys.length > 8 ? ", …" : ""} }`;
  }
  return typeof value;
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function loadCandidates() {
  if (PATHS_FILE) {
    const text = await readFile(PATHS_FILE, "utf-8");
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  }
  return DEFAULT_CANDIDATES;
}

async function probe(method, path) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method,
      headers: { "GROUP-API-KEY": KEY, Accept: "application/json" },
      signal: controller.signal,
    });
    let note;
    if (method === "GET") {
      const text = await res.text();
      if (res.ok) {
        try {
          note = shapeOf(JSON.parse(text));
        } catch {
          note = `non-json ${text.length}B`;
        }
      } else {
        note = redact(text) || "(empty body)";
      }
    } else {
      const ct = res.headers.get("content-type") ?? "(none)";
      const len = res.headers.get("content-length") ?? "?";
      note = `content-type=${ct} content-length=${len}`;
    }
    return { status: res.status, note };
  } catch (err) {
    return { status: -1, note: `transport error: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!KEY) {
    console.error("CYBERDAY_API_KEY is not set — refusing to run.");
    process.exit(2);
  }
  if (MODE === "shape" && !args["i-understand"]) {
    console.error(
      "--shape will issue GET requests against production and capture\n" +
        "  response shapes. Re-run with --i-understand to acknowledge.",
    );
    process.exit(2);
  }

  const candidates = await loadCandidates();
  const estSecs = Math.ceil(
    (candidates.length - 1) * (THROTTLE_MS / 1000) + candidates.length * 0.5,
  );

  console.error("");
  console.error("Cyberday API probe");
  console.error(`  target          ${BASE}`);
  console.error(
    `  api-key sha256  ${keyFingerprint(KEY)}  (first 12 of fingerprint)`,
  );
  console.error(`  mode            ${MODE}`);
  console.error(`  paths           ${candidates.length}`);
  console.error(`  throttle        ${THROTTLE_MS}ms between requests`);
  console.error(`  est. runtime    ~${estSecs}s`);
  if (MODE === "shape") {
    console.error(
      "  WARNING: --shape issues GET against production. Captured output\n" +
        "           is top-level field names only; emails/UUIDs in error\n" +
        "           bodies are redacted. Review .discovery/*.md before\n" +
        "           committing anything.",
    );
  }
  if (MODE === "dry-run") {
    console.error("  (dry-run) — no requests will be sent");
    process.exit(0);
  }

  const answer = await ask("\nType 'yes' to proceed: ");
  if (answer !== "yes") {
    console.error("Aborted.");
    process.exit(1);
  }

  const method = MODE === "shape" ? "GET" : "HEAD";
  const rows = [];
  let aborted = null;
  for (let i = 0; i < candidates.length; i++) {
    const path = candidates[i];
    if (i > 0) await sleep(THROTTLE_MS);
    const { status, note } = await probe(method, path);
    const stamp = `${String(i + 1).padStart(2)}/${candidates.length}`;
    console.error(
      `[${stamp}] ${String(status).padStart(4)} ${method.padEnd(4)} ${path}  ${note}`,
    );
    rows.push({ path, status, note });
    if (status === 429 || (status >= 500 && status < 600)) {
      aborted = `received ${status} — halting to protect production`;
      console.error(`\nAborting: ${aborted}`);
      break;
    }
  }

  const outDir = resolve(REPO_ROOT, ".discovery");
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(outDir, `${ts}-${method.toLowerCase()}.md`);
  const md = [
    `# Cyberday probe — ${method} — ${ts}`,
    "",
    `Target: \`${BASE}\``,
    `API key sha256 (first 12 chars): \`${keyFingerprint(KEY)}\``,
    `Throttle: ${THROTTLE_MS}ms between requests`,
    aborted ? `Run aborted early: ${aborted}` : "Run completed without abort.",
    "",
    "| # | Path | Status | Note |",
    "|---|------|--------|------|",
    ...rows.map(
      (r, i) =>
        `| ${i + 1} | \`${r.path}\` | ${r.status} | ${String(r.note).replace(/\|/g, "\\|")} |`,
    ),
    "",
  ].join("\n");
  await writeFile(outPath, md, "utf-8");
  console.error(`\nWrote ${outPath}`);
  console.error(
    "\nReview the file. To capture top-level keys for promising paths,\n" +
      "re-run with --shape --i-understand. Do not commit .discovery/*.md\n" +
      "without re-reading it for anything that looks like real data.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

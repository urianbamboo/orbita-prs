/**
 * Minimal .env loader — no dotenv package (avoids CJS require() inside ESM bundle).
 *
 * Search order:
 *   1. ENV_FILE env var (explicit override — must exist if set)
 *   2. Repo root relative to this module (two levels up from server/src/)
 *   3. process.cwd()/.env
 *
 * Rules:
 *   - Never walks parent directories beyond the detected repo root.
 *   - Never references a hard-coded absolute path.
 *   - Does NOT override already-set, non-empty process.env values;
 *     the file only fills missing or empty slots.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here     = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

/** Parse KEY=VALUE lines; supports double/single quotes and \n escapes. */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    val = val.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    out[key] = val;
  }
  return out;
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveCandidates(): string[] {
  const explicit = process.env["ENV_FILE"];
  if (explicit) return [explicit]; // honour explicit override; warn below if missing

  return [
    path.join(repoRoot, ".env"),
    path.resolve(process.cwd(), ".env"),
  ];
}

const candidates = resolveCandidates();
const envPath    = candidates.find(fileExists) ?? null;

if (!envPath) {
  if (process.env["ENV_FILE"]) {
    throw new Error(`[env] ENV_FILE="${process.env["ENV_FILE"]}" not found`);
  } else {
    console.warn(`[env] .env not found. Tried: ${candidates.join(" | ")}`);
  }
} else {
  const parsed = parseEnvFile(fs.readFileSync(envPath, "utf8"));
  let filled = 0;
  for (const [key, val] of Object.entries(parsed)) {
    // Only fill values that are unset or empty — do not override already-set vars.
    if (!process.env[key]) {
      process.env[key] = val;
      filled++;
    }
  }
  const hasApp   = Boolean(process.env["GITHUB_APP_ID"]?.trim());
  const hasKey   = Boolean(process.env["GITHUB_APP_PRIVATE_KEY"]?.trim());
  const hasApp2  = Boolean(process.env["GITHUB_APP_2_ID"]?.trim());
  const hasKey2  = Boolean(process.env["GITHUB_APP_2_PRIVATE_KEY"]?.trim());
  const hasToken = Boolean(process.env["GITHUB_TOKEN"]?.trim());
  console.log(
    `[env] loaded ${envPath} (${filled} vars filled)` +
      ` (APP_ID=${hasApp ? "set" : "missing"}` +
      ` APP_KEY=${hasKey ? "set" : "missing"}` +
      ` APP2_ID=${hasApp2 ? "set" : "missing"}` +
      ` APP2_KEY=${hasKey2 ? "set" : "missing"}` +
      ` TOKEN=${hasToken ? "set" : "missing"})`,
  );
  if (hasApp && !hasKey) {
    console.warn(
      "[env] GITHUB_APP_ID is set but GITHUB_APP_PRIVATE_KEY is empty after parse",
    );
  }
}

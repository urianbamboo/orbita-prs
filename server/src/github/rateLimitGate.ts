/**
 * Circuit breaker for GitHub secondary rate limits.
 * Primary quota (x-ratelimit-remaining) can look healthy while secondary still 403s.
 * When tripped, sync must stop calling the API until cooldown elapses.
 */

let cooldownUntilMs = 0;
let lastReason = "";

const DEFAULT_COOLDOWN_MS = 5 * 60_000;

export function isSecondaryRateLimit(err: unknown): boolean {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err ?? "");
  return /secondary rate limit/i.test(msg);
}

export function tripSecondaryCooldown(err?: unknown, cooldownMs = DEFAULT_COOLDOWN_MS): void {
  const retryAfter =
    err &&
    typeof err === "object" &&
    "response" in err
      ? Number(
          (err as { response?: { headers?: Record<string, string> } }).response?.headers?.[
            "retry-after"
          ],
        )
      : NaN;
  const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1000
    : cooldownMs;

  const until = Date.now() + waitMs;
  if (until <= cooldownUntilMs) return;

  cooldownUntilMs = until;
  lastReason = err instanceof Error ? err.message.slice(0, 120) : "secondary rate limit";
  console.warn(
    `[sync] Secondary rate limit — pausing GitHub calls for ${Math.ceil(waitMs / 1000)}s`,
  );
}

export function secondaryCooldownActive(): boolean {
  return Date.now() < cooldownUntilMs;
}

export function secondaryCooldownRemainingMs(): number {
  return Math.max(0, cooldownUntilMs - Date.now());
}

export function assertSecondaryClear(): void {
  if (!secondaryCooldownActive()) return;
  const secs = Math.ceil(secondaryCooldownRemainingMs() / 1000);
  throw new Error(
    `GitHub secondary rate-limit cooldown (${secs}s left). ${lastReason}`,
  );
}

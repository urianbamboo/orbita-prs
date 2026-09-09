import type { Octokit } from "@octokit/rest";
export interface GhCall {
  at: string;
  client: string;
  method: string;
  url: string;
  status?: number;
  remaining?: string;
  reset?: string;
}

const MAX = 200;
const log: GhCall[] = [];
const counts = new Map<string, number>();

export function recordGhCall(entry: GhCall): void {
  log.push(entry);
  if (log.length > MAX) log.shift();
  const key = `${entry.method} ${stripQuery(entry.url)}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function stripQuery(url: string): string {
  return url.split("?")[0] ?? url;
}

export function ghTrafficSnapshot(): {
  total: number;
  byRoute: Record<string, number>;
  recent: GhCall[];
} {
  return {
    total: log.length,
    byRoute: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])),
    recent: log.slice(-50),
  };
}

export function instrumentOctokit(octokit: Octokit, client: string): void {
  octokit.hook.before("request", (options) => {
    recordGhCall({
      at: new Date().toISOString(),
      client,
      method: options.method ?? "GET",
      url: String(options.url ?? ""),
    });
  });
  octokit.hook.after("request", (response) => {
    const remaining = response.headers?.["x-ratelimit-remaining"];
    const reset = response.headers?.["x-ratelimit-reset"];
    if (remaining !== undefined) {
      const last = log[log.length - 1];
      if (last && last.client === client) {
        last.status = response.status;
        last.remaining = String(remaining);
        last.reset = reset ? String(reset) : undefined;
      }
    }
  });
}

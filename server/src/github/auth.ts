/**
 * GitHub auth factory.
 * Supports one or two private Apps (one per org) plus PAT fallback.
 *
 *   GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY [/ GITHUB_APP_INSTALLATION_ID]
 *   GITHUB_APP_2_ID / GITHUB_APP_2_PRIVATE_KEY [/ GITHUB_APP_2_INSTALLATION_ID]
 */
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { instrumentOctokit } from "./traffic.js";

export type AuthMode = "app" | "pat" | "mock";

export interface AppSlot {
  label: string;
  appId: number;
  privateKey: string;
  installationId?: number;
}

export interface GitHubClient {
  label: string;
  octokit: Octokit;
  /** Account logins this installation can see (org or user), lowercase. */
  accounts: string[];
}

let _authMode: AuthMode | null = null;

export function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

export function parseAppSlots(env: NodeJS.ProcessEnv = process.env): AppSlot[] {
  const slots: AppSlot[] = [];

  const first = slotFrom(env, "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_INSTALLATION_ID", "app-1");
  if (first) slots.push(first);

  const second = slotFrom(env, "GITHUB_APP_2_ID", "GITHUB_APP_2_PRIVATE_KEY", "GITHUB_APP_2_INSTALLATION_ID", "app-2");
  if (second) slots.push(second);

  return slots;
}

function slotFrom(
  env: NodeJS.ProcessEnv,
  idKey: string,
  pemKey: string,
  instKey: string,
  label: string,
): AppSlot | null {
  const appIdRaw = env[idKey]?.trim();
  const rawKey = env[pemKey]?.trim();
  if (!appIdRaw || !rawKey) return null;
  const appId = parseInt(appIdRaw, 10);
  if (!Number.isFinite(appId)) return null;
  const instRaw = env[instKey]?.trim();
  return {
    label,
    appId,
    privateKey: normalizePrivateKey(rawKey),
    installationId: instRaw ? parseInt(instRaw, 10) : undefined,
  };
}

export function hasGitHubCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseAppSlots(env).length > 0 || Boolean(env["GITHUB_TOKEN"]?.trim());
}

async function discoverInstallationId(slot: AppSlot): Promise<number | null> {
  try {
    const appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: slot.appId, privateKey: slot.privateKey },
    });
    const { data: installations } = await appOctokit.rest.apps.listInstallations({ per_page: 100 });
    if (installations.length === 0) {
      console.warn(`[auth] ${slot.label}: GitHub App has no installations — install it on the org`);
      return null;
    }
    const org = process.env["PR_ORBIT_ORG"];
    const preferred = org
      ? installations.find(
          (i) =>
            i.account &&
            "login" in i.account &&
            i.account.login.toLowerCase() === org.toLowerCase(),
        )
      : null;
    if (installations.length > 1 && !preferred && !slot.installationId) {
      const names = installations
        .map((i) => (i.account && "login" in i.account ? i.account.login : String(i.id)))
        .join(", ");
      console.warn(`[auth] ${slot.label}: several installations (${names}) — using the first. Set INSTALLATION_ID to pin.`);
    }
    return (preferred ?? installations[0]!).id;
  } catch (err) {
    console.warn(`[auth] ${slot.label}: could not discover installation:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function clientFromSlot(slot: AppSlot): Promise<GitHubClient | null> {
  let installationId = slot.installationId ?? null;
  let accountLogin: string | undefined;

  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: slot.appId, privateKey: slot.privateKey },
  });

  try {
    const { data: installations } = await appOctokit.rest.apps.listInstallations({ per_page: 100 });
    if (installations.length === 0) {
      console.warn(`[auth] ${slot.label}: GitHub App has no installations — install it on the org`);
      return null;
    }
    const org = process.env["PR_ORBIT_ORG"];
    const preferred = org
      ? installations.find(
          (i) =>
            i.account &&
            "login" in i.account &&
            i.account.login.toLowerCase() === org.toLowerCase(),
        )
      : null;
    // Prefer explicit INSTALLATION_ID, then org match, then first
    const chosen =
      (slot.installationId
        ? installations.find((i) => i.id === slot.installationId)
        : null) ??
      preferred ??
      installations[0]!;
    installationId = chosen.id;
    if (chosen.account && "login" in chosen.account) {
      accountLogin = chosen.account.login;
    }
    if (installations.length > 1 && !slot.installationId && !preferred) {
      const names = installations
        .map((i) => (i.account && "login" in i.account ? i.account.login : String(i.id)))
        .join(", ");
      console.warn(`[auth] ${slot.label}: several installations (${names}) — using ${accountLogin ?? installationId}. Set INSTALLATION_ID to pin.`);
    }
  } catch (err) {
    console.warn(`[auth] ${slot.label}: could not list installations:`, err instanceof Error ? err.message : err);
    if (!installationId) return null;
  }

  if (!installationId) return null;

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: slot.appId,
      privateKey: slot.privateKey,
      installationId,
    },
  });
  instrumentOctokit(octokit, `${slot.label}#${installationId}`);
  const accounts = accountLogin ? [accountLogin.toLowerCase()] : [];
  console.log(
    `[auth] ${slot.label} → installation ${installationId}` +
      (accountLogin ? ` (@${accountLogin})` : ""),
  );
  return { label: slot.label, octokit, accounts };
}

export async function createGitHubClients(): Promise<GitHubClient[]> {
  const clients: GitHubClient[] = [];
  for (const slot of parseAppSlots()) {
    const client = await clientFromSlot(slot);
    if (client) clients.push(client);
  }

  if (clients.length > 0) {
    _authMode = "app";
    console.log(`[auth] GitHub App mode — ${clients.length} installation(s)`);
    return clients;
  }

  const pat = process.env["GITHUB_TOKEN"]?.trim();
  if (pat) {
    _authMode = "pat";
    const octokit = new Octokit({ auth: pat });
    instrumentOctokit(octokit, "pat");
    return [{ label: "pat", octokit, accounts: [] }];
  }

  _authMode = "mock";
  return [];
}

/** First live client, or null (mock). */
export async function createOctokit(): Promise<Octokit | null> {
  const clients = await createGitHubClients();
  return clients[0]?.octokit ?? null;
}

export function getAuthMode(): AuthMode {
  return (
    _authMode ??
    (parseAppSlots().length > 0 ? "app" : process.env["GITHUB_TOKEN"] ? "pat" : "mock")
  );
}

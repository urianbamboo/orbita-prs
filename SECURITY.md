# Security Policy

## Reporting a vulnerability

If you find a security issue in this project (credential leak, auth bypass, XSS, etc.), please open a **private** security advisory on the GitHub repo or email the maintainer via their GitHub profile. Do not open a public issue with secrets or exploit details.

## What this app stores

- **No database.** PR state lives in process memory and is refreshed from the GitHub API.
- **Shepherd hints** (optional agent overlay) are also in-memory and expire by TTL.
- Credentials belong only in a local `.env` (or your host's secret store). They are never sent to a third party other than `api.github.com`.

## Never commit

| Item | Why |
|------|-----|
| `.env` | Live App IDs, PEMs, PATs, shepherd tokens |
| `secret/` and `*.pem` | GitHub App private keys |
| Installation IDs tied to a private org | Not secret by themselves, but couple the template to your account |

Use [`.env.example`](.env.example) as the template. Copy to `.env` locally.

## Rotating a leaked GitHub App key

1. GitHub → your App → **Private keys** → generate a new key; delete the old one.
2. Update `GITHUB_APP_PRIVATE_KEY` (or `_2_`) in `.env` / production env.
3. Restart the server.
4. If a PAT leaked: revoke it under GitHub → Settings → Developer settings → Tokens.

## Permissions (least privilege)

The recommended GitHub App permissions are **read-only**: Pull requests and Metadata. Keep Contents and Checks at **No access**. Do not grant write, administration, or webhook delivery unless you intentionally extend the product.

## Production notes

- Prefer a private GitHub App installed only on the orgs/users you monitor.
- Set a strong `SHEPHERD_INGEST_TOKEN` to enable shepherd writes. Empty tokens fail closed; `SHEPHERD_ALLOW_ANON=1` is only for disposable local demos.
- The server binds to `HOST=127.0.0.1` and validates the `Host` header by default. Use `0.0.0.0` only with `TRUSTED_HOSTS` behind a trusted VPN or authenticated reverse proxy.

# Engineering baseline rollout — 2026-09-29

The public source repository serves a single-user local PR dashboard. Its data can include private repository metadata (C2), but it does not store files or run database migrations: GitHub polling and shepherd hints live in process memory. Classify as internal runtime, unregulated, stateless web app, users/consumers `me`, deployment `none`. macOS, Linux and Windows quick starts are documented; compile locally on macOS and exercise Linux in CI.

Existing VPS and Railway instructions are deployment recipes, not evidence that this repository has an active deployment. Do not claim staging, flags, CalVer or rollback receipts without an actual service. Existing Fastify logs are enough for the personal local use case; no alert integration is justified today.

Use the repository's npm workspaces and Vitest suite, Node build, Semgrep OWASP rules, gitleaks and production npm audit in the local gate. Reject an empty test suite. CI runs the fast test/build subset in an inline job: the shared Node workflow is private and the public caller produced a zero-job failure, so it cannot serve this repository. Rejected: copying the Python gate and adding fictitious Python dependencies/tests solely to satisfy its receipt shape.

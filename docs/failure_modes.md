# Failure modes

The API regression suite exercises these failure paths with Fastify injection. The locks below are enforcement source files, not dependency lockfiles.

| Failure mode | Detection and regression coverage | Enforcement |
| --- | --- | --- |
| Cross-site request triggers manual GitHub synchronization without the action header | `test:server/src/routes/api.test.ts`: "rejects manual sync without the CSRF-resistant action header" asserts HTTP 403. | `lock:server/src/routes/api.ts` |
| Shepherd ingestion accepts writes when authentication is not configured | `test:server/src/routes/api.test.ts`: "fails closed when shepherd authentication is not configured" asserts HTTP 503; the explicit anonymous-demo opt-in is separately exercised. | `lock:server/src/routes/api.ts` |
| Invalid hint timestamps enter the shepherd store | `test:server/src/routes/api.test.ts`: "rejects malformed hint timestamps before storing them" asserts HTTP 400. | `lock:server/src/routes/api.ts` |

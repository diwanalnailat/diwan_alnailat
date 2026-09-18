# Working on Diwan Al-Nailat

Read README.md, docs/CODEX_HANDOFF.md and docs/READINESS.md before substantial changes. Reuse this repository and the exact Site project_id in .openai/hosting.json. Preserve its current audience. Do not make the Site public to enable a webhook or phone login.

- Preserve the plain JavaScript Worker/D1/R2 architecture unless the user authorizes migration; do not replace it with a starter.
- Preserve historical migrations and journal. Generate a new Drizzle migration for schema changes. Never initialize schema from a request handler.
- Authorization belongs on the server. Reuse domain.js and record scopes; UI hiding alone is insufficient. Denies and expiry apply to reads, writes, files, exports and Sanad.
- Money is integer halala. Keep financial/movement changes in guarded atomic batches. Do not replace two-stage approval with a model decision. A claimant/creator cannot approve their expense; the committee's administrative delegate handles conflicts.
- Sanad's trusted policy is lib/sanad-policy.js. Tools accept structured parameters, never SQL, shell or arbitrary URLs. Drafts require review in real forms. Never describe a provider as connected until a real test succeeds.
- Arabic: النائلات، ديوان النائلات، الشيخ عبدالله بن عامر النهدي. English digits. Avoid أهل الديوان، حكاية، المراح. Preserve brand and landing design unless requested.
- Never commit secrets or real personal test data. Production trusts the Sites gateway; never expose that header-based entrypoint on another host.
- Run meaningful tests for changed workflows, and npm test + npm run build for cross-cutting changes. Record actual results and remaining gates. Do not call these a penetration test or promise zero vulnerabilities.
- generated.js and dist come from scripts/build.mjs. Keep them in the same release state as source. Do not test by deleting live data.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

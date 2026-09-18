# Supabase connection

The local workspace uses Supabase PostgreSQL and private Storage as of 2026-09-18. Project: `eaycmhaxtmbdzidxsfvx`. Run `npm run dev`, then open `http://127.0.0.1:4173/workspace`. Existing Save/Submit actions persist data; there is no per-keystroke autosave.

## Configuration

Requires Node 22.22.2+. Keep these server-only values in ignored `.env.local`:

- `DATABASE_URL`: the project's Transaction pooler URI, with the actual URL-encoded password and no placeholder brackets. TLS is required and prepared statements are disabled.
- `SUPABASE_URL`: base project URL.
- `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY`: server credential, never a public browser variable.
- `SUPABASE_STORAGE_BUCKET=diwan-files`.

A publishable key alone cannot access application records. All 26 tables have RLS and no anon/authenticated CRUD grants. Existing Worker/domain authorization still applies. Login-free developer identity remains restricted to loopback; it must never be exposed on a public host.

## Schema and existing data

For a NEW database only, execute `supabase/diwan-initial.sql` in SQL Editor. This was already done for the current project; do not rerun it. The source is `db/schema.postgres.ts`, with generated migration history in `supabase/drizzle/`. Manual SQL execution does not populate a remote Drizzle migration journal: establish its baseline before using an automated migrator. Historical SQLite migrations are preserved. Request handlers never initialize schema.

The 20 existing local records were transferred and independently matched across all 26 tables. Original local data was preserved. The explicit transfer tool, `node --env-file=.env.local scripts/migrate-local-supabase.mjs`, refuses a nonempty target; do not rerun it against this populated project. Financial and stock writes retain guarded atomic transactions. Money remains integer halala.

Without DATABASE_URL the local runner uses its original SQLite/files backend. With DATABASE_URL it fails on remote setup errors instead of silently saving locally.

## Storage and verification

`npm run db:setup-storage` creates the private bucket once. The current `diwan-files` bucket is private, limited to 10 MiB and allowed media/document MIME types. Upload, download and deletion use the Storage API through the authorized server.

```sh
npm run db:check
npm test
npm run test:postgres
npm run build
```

The read-only connection check verifies the PostgreSQL catalog, expected tables, RLS and bucket privacy. PostgreSQL tests use PGlite with the actual schema; legacy SQLite migration tests still use SQLite.

Verified 2026-09-18: real remote write/read in a fully rolled-back test transaction; all migrated records matched; local API health/state returned 200. Both 55-test suites, build, lint and typecheck passed. No actual object upload was tested; Storage adapter tests use mocked responses and there were no local files to transfer.

## Deployment boundary

The local workspace is connected. Production Vercel configuration now includes server database/Storage credentials; `/api/health` verifies its database connection. At the user's explicit request, production workspace APIs remain closed (403) until standalone WhatsApp OTP login is implemented. See [Green API and admin setup](GREEN_API.md). The original private Site/D1/R2 audience and data remain unchanged. Deployment evidence is recorded in task-state.md.

# WhatsApp via Green API

The existing server notification and phone-verification transport supports `WHATSAPP_PROVIDER=green_api`. Meta remains available when that flag is absent. Set `WHATSAPP_ENABLED=true`, `GREEN_API_URL`, `GREEN_API_INSTANCE`, `GREEN_API_TOKEN`, and HTTPS `APP_BASE_URL` as server secrets. Green API sends text directly and does not require Meta templates. The provider token must never reach browser code, logs or Git.

`npm run whatsapp:check` reads the provider's authorization state and compares its linked phone with `GREEN_API_PHONE`. It sends no messages. Implemented against the official [SendMessage](https://green-api.com/en/docs/api/sending/SendMessage/), [GetStateInstance](https://green-api.com/en/docs/api/account/GetStateInstance/) and [GetSettings](https://green-api.com/en/docs/api/account/GetSettings/) contracts. A returned message ID means accepted into the queue, not confirmed delivery. Unknown outcomes require review instead of automatic duplicate sends; only explicit rate limits are retryable. Delivery webhooks are not enabled.

## Administrator and OTP preparation

The existing Supabase Auth administrator has been linked to an application member with administrator grants and the requested international phone. Provisioning uses `scripts/configure-supabase-admin.mjs` with `SITE_OWNER_EMAIL` and `DIWAN_ADMIN_PHONE`; it uses the Auth Admin API and a database transaction, records an audit event, and never marks a newly assigned phone verified. No production phone numbers or emails belong in fixtures or source files.

The existing `nl_otp` table already stores hashes, expiry, attempts and one-time-use state; `nl_members.phone` is unique. `OTP_SECRET` is configured privately. The existing OTP flow verifies a phone for a trusted Sites/local identity. Independent login sessions through WhatsApp OTP remain a separate implementation step; saving an administrator phone does not authenticate possession.

## Publishing boundary

The user explicitly requested that production workspace stay closed while local development remains open. Next production returns 403 for workspace API routes and displays a closed-workspace page; forged Sites headers do not grant access. `/api/health` only checks the configured PostgreSQL connection and returns a non-sensitive status. Development rewrites continue to the loopback Worker and cloud database. No public send-message or OTP-login endpoint has been opened.

Production-only Vercel secrets were configured through the existing project dashboard. A deployment is required after code/environment changes. Provider verification succeeded with an authorized matching account on 2026-09-19; no actual WhatsApp message was sent during this setup.

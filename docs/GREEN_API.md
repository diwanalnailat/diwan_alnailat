# WhatsApp via Green API

The existing server notification and phone-verification transport supports `WHATSAPP_PROVIDER=green_api`. Meta remains available when that flag is absent. Set `WHATSAPP_ENABLED=true`, `GREEN_API_URL`, `GREEN_API_INSTANCE`, `GREEN_API_TOKEN`, and HTTPS `APP_BASE_URL` as server secrets. Green API sends text directly and does not require Meta templates. The provider token must never reach browser code, logs or Git.

`npm run whatsapp:check` reads the provider's authorization state and compares its linked phone with `GREEN_API_PHONE`. It sends no messages. Implemented against the official [SendMessage](https://green-api.com/en/docs/api/sending/SendMessage/), [GetStateInstance](https://green-api.com/en/docs/api/account/GetStateInstance/) and [GetSettings](https://green-api.com/en/docs/api/account/GetSettings/) contracts. A returned message ID means accepted into the queue, not confirmed delivery. Unknown outcomes require review instead of automatic duplicate sends; only explicit rate limits are retryable. Delivery webhooks are not enabled.

## Administrator and WhatsApp login

The existing Supabase Auth administrator has been linked to an application member with administrator grants and the requested international phone. Provisioning uses `scripts/configure-supabase-admin.mjs` with `SITE_OWNER_EMAIL` and `DIWAN_ADMIN_PHONE`; it uses the Auth Admin API and a database transaction, records an audit event, and never marks a newly assigned phone verified. No production phone numbers or emails belong in fixtures or source files.

Enable `DIWAN_AUTH_ENABLED=true` on the production server. `/login` accepts an active member's phone and consent, then sends a six-digit WhatsApp code. Codes expire after five minutes, allow five attempts, and are bound to the requesting browser. Requests have per-phone, per-IP and global limits. Unknown numbers receive the same generic response. Saving an administrator phone does not authenticate possession.

Successful verification consumes the code atomically and creates a 12-hour server session. Only token hashes are stored in `nl_sessions`; the browser receives a Secure, HttpOnly, SameSite cookie. Every protected request checks current membership status, phone and permissions. Logout revokes the session. These are application sessions, not Supabase Auth JWTs; the existing Auth member link is preserved. Apply the versioned `supabase/drizzle/0002_whatsapp_sessions.sql` once after the existing baseline; it enables RLS and grants no anonymous or authenticated client access.

## Publishing boundary

Production `/workspace` redirects unauthenticated visitors to `/login`; workspace APIs return 401. Verified sessions enter the existing Worker/domain authorization path; client-supplied Sites headers are discarded. `/api/health` only checks the configured PostgreSQL connection and returns a non-sensitive status. Development rewrites continue to the loopback Worker and cloud database without a login. The original private Site audience is unchanged.

Production-only Vercel secrets are configured on the existing project. A deployment is required after code/environment changes. Provider verification succeeded with an authorized matching account on 2026-09-19. See task-state.md for actual delivery and deployment verification; provider acceptance alone is not delivery confirmation.

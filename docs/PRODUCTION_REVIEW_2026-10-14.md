# Production review — 2026-10-14

**Status: final release765598a is published and verified live. Tested operational workflows work; broad production readiness remains conditional on backup/restore, attachment scanning and capacity gates. Financial drafts require human review.**

This review covers the existing Diwan application and the user's requested
Sanad document extraction, permission boundaries and execution checklists.
It does not certify zero defects, independent penetration testing, 100,000
concurrent users or 1,000,000 GB of object storage. The evidence below distinguishes
the live release from changes still being prepared locally.

## Findings and corrections

| Area | Finding and current result |
| --- | --- |
| Documents | Financial extraction now supports PDF, images, text, DOCX and XLSX. Real OpenAI checks recovered expected invoice fields from synthetic examples, including an Arabic image. User changes remain authoritative; forms require review and explicit save. |
| Financial interpretation | Missing tax remains missing, and foreign-currency amounts are not silently treated as SAR. An unrelated document containing injected instructions returned no financial fields. Money is independently reread with gpt-5.4 without seeing the first candidate values. Agreement alone proved insufficient: the final guard also withholds BOTH monetary fields when either reading contains Arabic/Persian digits or separators. Final production retest returned null/null for the problematic image. Human comparison against the source remains required. |
| Access and scope | Hidden-budget queries were refused with zero provider calls. Unrelated chat was refused. Existing scoped reads, deny/expiry rules, amount redaction, finance/export/file boundaries and post-provider authorization checks have automated regressions. |
| Voice | A real Arabic transcription request succeeded with `gpt-4o-mini-transcribe`; transcription still needs user review. Production model configuration and enabled voice state were verified. |
| Maintenance | Added and verified authenticated daily Vercel maintenance at `0 3 * * *` (06:00 Riyadh), requiring a random server-only `CRON_SECRET` of at least 32 characters. The sensitive production secret is configured. The first scheduled execution remains to be observed; no cleanup of live data was invoked as a test. |
| Cron security | Authentication happens before database/job imports; comparison uses fixed-length hashes and `timingSafeEqual`. HEAD cannot trigger maintenance. Duplicate invocations respect the existing lease. Errors hide internal details and responses are not cached. |
| Dependency audit | Initial runtime audit reported critical/high findings. Next.js and its ESLint configuration were upgraded to 16.3.8. The subsequent production-only npm audit reports zero advisories. Development-tool dependency advisories remain in the full audit and require separate tracking. |
| Interface | The release owner reports 24 live sidebar sections checked at 1440px and 375px, with no navigation-load errors or horizontal overflow. Contrast, audit-table keyboard access and the asset serial field label were corrected. Eleven create forms and eight settings tabs were checked at375px without overflow; modal opening scroll was0. This visit matrix does not mean every mutating action was exercised in production. |
| Action wiring | Source inspection matched all 59 literal `data-action` values in app/workspace/views to handlers or explicit guards; 144 switch cases exist. The mixed-script `join-dيوان` action has a handler. Dynamic actions and business outcomes need workflow tests. |

The daily maintenance job calls the established retention/cleanup routine and
notification dispatcher. It removes expired conversations, OTP/limit entries and
abandoned staged uploads, reconciles uncertain delivery jobs, and prepares at most
100 task reminders. Dispatch attempts at most 20 eligible notifications using the
existing authorization and recipient-preference checks. It does not introduce a
financial approval, payment or user-impersonation path. These bounded batches and
a daily schedule are insufficient for the requested large-scale workload.

## Test and evidence matrix

All artifact names below are under the executing machine's `%TEMP%` directory;
they are not public download links. Synthetic checks did not create production
financial records or fictitious verified members.

| Check | Actual result | Evidence / limitation |
| --- | --- | --- |
| Full SQLite suite, baseline | 208/208 passed, Node 22.23.2, 24.38s | `diwan-exhaustive-tests.log`; before concurrent corrections, not final-release evidence |
| Full PostgreSQL-compatible suite | 208/208 passed, 164.63s | `diwan-exhaustive-postgres.log`; PGlite, during concurrent work, not live production load |
| Financial export/file expiry boundaries | SQLite 2/2; PostgreSQL 2/2 | `diwan-exhaustive-workflow-evidence.json`, `diwan-exhaustive-finance-boundaries-pg.log` |
| Document, voice, scope/security regressions | SQLite 27/27 | `diwan-sanad-document-audit-tests.log` |
| Document and voice PostgreSQL regressions | 13/13 | `diwan-sanad-document-audit-postgres.log` |
| Real OpenAI document/scope cases | 10/10 | `diwan-sanad-document-audit.json`; PDF, image, text, DOCX, XLSX, injection, foreign currency, missing tax, hidden budget and unrelated chat |
| Additional real OpenAI cases | 4/4 | `diwan-sanad-document-audit-extra.json`; DOCX/XLSX through Worker route, Arabic image and Arabic voice |
| Cron/readiness affected tests | SQLite 13/13; PostgreSQL cron 4/4 | `diwan-ops-audit-tests.log`, `diwan-ops-audit-postgres.log` |
| Live Sanad execution checklist | Passed on preceding production release | `diwan-sanad-authenticated-production.json`; 8 steps generated, manual edits preserved, unrelated request refused, dialog canceled without task save |
| Live navigation | 24 sections at375/768/1440px | Captures `diwan-audit-nav375-{a,b}.json`, `diwan-audit-nav768.json`, `diwan-audit-nav1440.json`; final contrast rerun follows publication |
| Production dependency audit after upgrade | Zero reported runtime advisories | `diwan-dependency-audit-production-final.json`; full development audit is separate |
| Final integrated suite/build/typecheck/lint | SQLite222/222; PostgreSQL222/222; build including TypeScript and lint passed | `diwan-final-{tests,postgres,build,lint}.log`, Node22.23.2; final help-policy refinement retested14/14 on both databases |
| Final conservative guard checks | SQLite226/226; affected PostgreSQL13/13; build passed | `diwan-raw-guard-final-{tests,build}.log`, `diwan-invoice-raw-guard-postgres.log`; earlier full PostgreSQL222/222 used PGlite, not a production load test |
| Final publication / live artifact match | READY765598a; exact app/CSS assets match; health200, unauthenticated state/extract/cron401, cronHEAD405 | `diwan-readiness-release-evidence.json`, verified2026-10-13T23:15:53Z; first scheduled cron run remains unobserved |
| Final production Arabic monetary guard | HTTP200; amount/tax null and uncertain, invoice number retained;4.374s | `diwan-final-production-raw-guard.json`,2026-10-13T23:16:13Z; existing staged synthetic file, no financial save |

Input hashes and timestamps are recorded in
`diwan-sanad-document-audit-evidence.json`,
`diwan-exhaustive-workflow-evidence.json` and
`diwan-ops-audit-evidence.json`. Results must be reassessed after relevant changes.

## Live infrastructure observations

Read-only checks at 2026-10-13T22:33:38Z (2026-10-14 Riyadh), captured in
`diwan-ops-audit-live.json`, found:

- All 29 application tables have RLS; no table grants to `anon`, `authenticated`
  or `PUBLIC`; no publicly executable security-definer functions in `public`.
- `storage.objects` has RLS and no client policies. Both application buckets are
  private: ordinary attachments permit 10 MiB and join-upload parts 4 MiB.
- Server database credentials use a role with RLS bypass. Server record-level
  authorization is essential; private buckets/RLS do not replace it.
- The database occupied approximately 13.2 MB and exposed `max_connections=60`.
  These observations say nothing about maximum supported user/data volume.
- The active deployment was READY on Vercel Hobby, with no cron definitions.
  `maintenance:last` was absent and PostgreSQL `pg_cron` was not installed.
- Four WhatsApp delivery jobs were `accepted`; no delivery/read confirmation was
  established by these checks.

## Remaining operational gates and concrete next steps

1. **Publication completed.** Release765598a / dpl_CUbDKdEBd83ET995foDgeZGuXKKX is READY on the primary production alias. Exact source-asset matches and final monetary guard were verified live. The corrected interface passed selected axe checks on24mobile light views and6desktop dark views; subsequent changes affected extraction/policy/help copy, not those layouts.376 tracked/untracked source and artifact files contained no known local credential values.
2. **Observe scheduled maintenance.** The definition and sensitive production secret are installed; unauthenticated401/HEAD405 verified. Observe the first scheduled run and `maintenance:last`. Maintenance execution and lease tests used isolated databases; production cleanup was not manually invoked to test it.
3. **Backup and recovery.** No source backup adapter/schedule, coordinated object
   snapshot or tested restoration was found. Provider backup entitlement and
   retention could not be verified with the available database/Storage credentials.
   Select a private backup destination and retention/RPO/RTO, export the database
   with an object manifest, copy object bytes, then restore into an isolated
   environment and compare financial totals, relationships and file hashes.
   Supabase database backups exclude Storage object bytes:
   [official backup documentation](https://supabase.com/docs/guides/platform/backups).
4. **Malware scanning.** No scanner provider, quarantine status or scanner callback
   integration exists in the inspected upload/storage source or environment
   contract. Connect a scanning service and implement pending/clean/rejected
   states with authenticated results before allowing scanned files to be opened
   or processed. Verify benign and antivirus-test fixtures, failures and timeouts.
   MIME checks, hashes, private access and lossless compression are not malware
   scanning. No paid service was provisioned in this review.
5. **Capacity.** Complete scoped pagination/aggregation and indexed search for
   remaining unbounded collections; measure concurrent API and object operations
   against the actual pool/runtime/provider quotas. Agree retention, ingestion,
   lifecycle and cost for petabyte storage. One local 100,000-account observation
   is not a concurrency or petabyte certification.
6. **Delivery and monitoring.** Configure and verify Green API delivery/read
   receipts if required; keep accepted distinct from delivered. Establish uptime,
   error-rate, provider rejection, cron failure and spending alerts. External
   alert delivery and provider spending limits were not verified here.

Sanad credentials and authenticated checklist generation were already verified on
the preceding live release. No new key setup is required. Document extraction is a
drafting aid within account permissions; neither model output nor an attachment
can grant authority or replace the established financial approvals.

## Authenticated production smoke before publication

The current production expense form accepted a synthetic PDF and automatically filled invoice SYN-AUDIT-42, total115.00 and tax15.00 (upload200, extraction200). The dialog was canceled: no expense save, approval or payment occurred. One staged synthetic attachment remains subject to normal expiry. Business chat returned200 and an unrelated cooking/sports question was refused; one synthetic business-help conversation was retained under normal retention. A final real isolated-model check after refining trusted UI guidance correctly described automatic fields, user-selected committee/payment source and explicit review. Evidence: `diwan-live-invoice-autofill.json`, `diwan-live-chat-{business,outside}.json`, `diwan-sanad-invoice-guidance-live.json`.

Final input identities and credential scan: `diwan-final-manifest.json`. Full npm audit retains5 high advisory entries caused by one unpatched development-only braces dependency chain; production-only audit reports0. Do not apply a breaking ESLint downgrade to conceal this.

## Post-release finding requiring follow-up

Release83ad24a / dpl_H57jtcmVYwuNBQssyW97TiWF4uow is READY and exact client artifacts match production.24mobilelight sections and6desktopdark sections pass the selected axe rules, with no network/runtime errors. The roster request occurs only on opening its dialog; DOCX autofill returns115/15. However, a repeat of the same Arabic image on production read23000/3000 instead of230/30. Earlier successful extraction is not evidence of reliable correction. Further isolated gpt-4.1 reads also misinterpreted the decimal. Financial extraction readiness remains conditional while stronger verification is investigated; amounts must not be guessed. Evidence: diwan-final-arabic-invoice-live.json and diwan-invoice-model-compare.json.

## Monetary verification follow-up

Single-model prompt refinement did not reliably fix the Arabic image. Both gpt-4.1 and repeated gpt-5.4 trials misread it in different ways; switching models alone was rejected. The final implementation performs independent blind monetary verification, compares strictly parsed values in halala, and withholds any field when verification disagrees, is ambiguous or fails. The primary reading never supplies candidate amounts to the verifier. This mitigates the observed failure; agreement is not a guarantee against common OCR errors, so human review remains required.

Real final tests: the exact ambiguous Arabic image yields amount=null and tax=null with other fields preserved; the clear English PDF still yields115.00/15.00. Observed endpoint times were12.4s and4.0s. SQLite26/26 and PostgreSQL12/12 affected checks passed; final integrated suite225/225 and build passed; preceding full PostgreSQL222/222 is supplemented by the12/12 changed-extraction checks. Publication is recorded in the task state. Evidence: `diwan-invoice-final-dualread.json`, `diwan-invoice-final-pdf-dualread.json`, `diwan-invoice-verification-tests.log`. Production server variable `OPENAI_INVOICE_VERIFY_MODEL=gpt-5.4` is configured. Extraction may make two model calls per action under the existing action quotas; additional latency/cost are deliberate safeguards.

## Final conservative guard (supersedes agreement-only mitigation)

A production retest on19f279b demonstrated a common-mode error: both readers agreed on230000/30000 for the same230/30 image. Thus agreement alone was insufficient. The final server guard now checks the original returned monetary strings before normalization. Any Arabic/Persian digit or separator in either reading withholds BOTH amount and tax, regardless of confidence or agreement. The exact problem image now returns null/null in the final real test, preserving other invoice fields. English-number PDF/image autofill stays available. UI guidance and trusted Sanad policy2026-10-14.2 explicitly explain manual entry for these numbers.

This checks model-returned text, not the original pixels: an identical erroneous ASCII transcription from both readers can still evade it. **No claim of universal monetary OCR accuracy is made; compare every financial draft with its source before submitting.** Final full SQLite226/226, final extraction PostgreSQL13/13 and build passed; the earlier full PostgreSQL222/222 run remains the broader workflow evidence. Lint scope is unchanged. Known local credential scan376 files found0matches. Evidence: `diwan-invoice-final-raw-guard.json`, `diwan-raw-guard-final-{tests,build}.log`, `diwan-invoice-raw-guard-postgres.log`, `diwan-final-manifest.json`.

Final publication verification at2026-10-13T23:15:53Z confirmed765598a2eb3e9887100e813a4606893de8d707fe / dpl_CUbDKdEBd83ET995foDgeZGuXKKX READY on https://diwan-alnailat.vercel.app. A fresh authenticated browser reload followed by extraction of the existing problematic staged image returned HTTP200 in4.374s, amount=null, tax=null, both uncertain, invoice number AR-2026-42 retained and requires_review=true. Evidence: `diwan-readiness-release-evidence.json` and `diwan-final-production-raw-guard.json`. Three synthetic staged uploads and one business-help conversation remain subject to normal retention; no production expense, approval, payment, fictitious verification or notification was created. The browser was restored to desktop1440px on committees. Earlier failed OCR evidence is preserved above; publication does not resolve the remaining operational gates.

# Production review — 2026-10-13

**Status: release candidate; operational readiness remains conditional.** This
review covers the working changes on `feat/production-readiness`, based on
`55dfff4a1a4d938218165264fd293d2edaabc10e`. It is a source review with automated
workflow tests and isolated UI checks. It is not a penetration test, a guarantee
of zero vulnerabilities, or certification for 100,000 concurrent users or
1,000,000 GB of storage.

## Findings corrected

| Finding | Result and evidence |
| --- | --- |
| Document search lost the linked task's committee scope, allowing a committee-specific document deny to be missed. | Search uses the same `canDocument` policy as document reads and batches linked-task lookups. SQLite/PostgreSQL tests cover scoped denial, inherited access, and expiry. |
| Audit module access could expose rows denied for a particular project. | Every returned audit row is checked against its project scope. Project-only audit grants also work without requiring global access. |
| Workspace collections were queried before invalid identity was rejected. | Missing and disabled identities fail before workspace-wide queries. Tests verify zero collection reads. |
| Task screens read the entire active account directory to display a few names. | People are fetched by bounded groups of authorized record/committee-related IDs. An ordinary caller cannot force the full directory by requesting the users screen. The local 100,000-account observation below verifies this change. |
| Selected completion reviewers could be missing from their dashboard or approval workflow. | Reviewer defaults to the committee manager, can be selected explicitly, and receives scoped access. Denies, membership removal and delegated permission expiry remain effective. Reviewer dashboard reads are covered on both databases. |
| Administrative approval and finance actions needed separate guarded state. | Completion creates an approval snapshot. Approve, hold, finance referral, clarification and payment controls preserve execution status. Version checks, idempotency and audit records are tested. Payment holds roll back payment/receipt binding and direct settlement atomically; changing an expense's task association cannot evade a hold. |
| Search could loop through unlimited inaccessible matches. | Candidate processing is capped at 500 matching records per resource; the UI identifies partial results and asks for a narrower query. This does not eliminate database scans caused by normalized substring search. |

New task-approval tables have versioned SQLite/PostgreSQL migrations; PostgreSQL
RLS and server-only grants are included. Additional indexes cover staged-file
cleanup, project/task expenses and per-record audit history. Local query-plan
tests verify index use without deleting existing synthetic rows.

Storage review verified private authorization, bounded binary inputs, multipart
checksums, bounded decompression and cancellation on disconnect. See
[STORAGE_READINESS.md](STORAGE_READINESS.md) for limits and operating gates.
Ordinary workspace attachments now use lossless gzip only when smaller, with
bounded decoding and original-byte checksum validation. Existing raw files stay
readable; metadata survives comments and reimbursement binding. Compression tests
passed on SQLite and PostgreSQL/PGlite.

## Actual validation

Evidence files below are local `%TEMP%` artifacts; they contain no API keys.

- Final full suite: **181/181 passed**, Node 22.23.2, in
  `diwan-readiness-release-tests.log`; final build passed in
  `diwan-readiness-release-build.log`. Configured lint passed in
  `diwan-readiness-lint.log`; its configured source scope did not change afterward.
- Latest scoped-people/read-security/dashboard/task-approval checks:
  **32/32 passed**, including SQLite and PostgreSQL/PGlite, in
  `diwan-scoped-people-tests.log`. This is not a live PostgreSQL load test.
- Isolated synthetic browser walkthrough: **23 sections at 1440px and 375px**
  (46 section/viewport visits); the release owner reports no API errors in that
  run. `diwan-workspace-browser.json` and `diwan-readiness-release-browser.log` record the visits and approval
  screenshots. This does not cover every action or every possible viewport.
- Focused provider-mocked storage checks: **11/11**; operational migration/index
  checks: **2/2**; Sanad policy/tool regression checks: **12/12**. Their logs are
  `diwan-storage-audit-tests.log`, `diwan-operational-indexes-tests.log` and
  `diwan-sanad-audit-tests.log`.
- Real OpenAI verification on 2026-10-13T00:41Z passed using the user's locally
  saved key and `gpt-4.1-mini`: a provider connectivity response plus two Sanad
  requests through the real Worker against isolated synthetic SQLite records.
  Both returned HTTP 200; the second successfully called `read_record`.
  Evidence: `diwan-sanad-live-provider.json` and `diwan-sanad-live-workflow.json`.
  This verifies provider/model integration, not production activation.

## Sanad document and scope follow-up (2026-10-13)

- Financial forms now read supported PDF, PNG/JPEG/WebP and plain-text uploads
  automatically, filling blank or untouched defaults for review. User edits,
  existing saved values and newer file selections take precedence. Saving and
  sending for approval remain explicit actions; unsupported formats use manual entry.
- Extraction requires the active member's assistant, file, expense create/edit
  and amount access, plus an open project and eligible committee. Access and
  attachment identity are checked again after the provider returns.
- Chat classifies relevance before sending workspace data or tools. Unrelated
  or malformed scope decisions never proceed to a business answer. Direct budget
  questions without a visible budget receive a server-authored refusal with zero
  model calls. Other phrasings still use field-redacted authorized records only.
  Permission or policy changes invalidate conversation history. The semantic
  classifier is a model-based control, not a guarantee against every wording.
- Final `npm test`: **196/196 passed**; `npm run build` passed. JSDOM exercises
  automatic extraction, preservation of edits/defaults, stale responses, explicit
  save and unconfigured-provider behavior. Scoped PostgreSQL suites also passed.
- Real OpenAI checks with synthetic data: **10/10** domain decisions matched
  expectations; a member's PDF invoice returned the expected number/date/115.00
  total/15.00 tax; an unrelated injected text document returned null fields;
  a restricted member's budget question made zero model calls. No production
  financial records were created. Evidence is in `%TEMP%/diwan-sanad-*-live.json`
  and `diwan-sanad-finance-evidence.json`, with source hashes and execution logs.
- Code release does not provision production credentials. Vercel environment
  access remains pending; the user's key is verified locally and kept out of Git.

## Local account-volume observation

One process, in-memory SQLite, sequential requests, one project, one committee,
one task and 100,004 synthetic members. No live data, phone verification, provider
messages or network load was used. Single-request observations are not latency
percentiles, peak-memory measurements or concurrent-user capacity results.

| Task screen request | Member rows read before → after | Elapsed before → after | Response bytes before → after |
| --- | ---: | ---: | ---: |
| Committee member | 100,004 → 3 | 2,139.72ms → 1.84ms | 13,682 → 13,682 |
| Owner | 100,004 → 3 | 185.74ms → 1.47ms | 7,401,353 → 12,384 |

Observed member-request heap growth fell from 86,102,064 to 997,352 bytes; these
are before/after process snapshots, not peak request memory. The services screen
read no member rows in either version. Evidence and the reproducible local script:
`diwan-local-state-scale-before.json`, `diwan-local-state-scale.json`, their logs,
and `diwan-local-state-scale.mjs`.

## Gates before an unconditional readiness claim

1. **Capacity remains blocked.** Authorized context still loads complete project,
   committee and permission collections. Explicit account directories and many
   task/expense/state collections remain unpaginated, with in-memory aggregation.
   The account-name fix does not solve large task histories or large committees.
   Implement scoped pagination/aggregation and indexed search, then measure a
   representative concurrent workload against the actual database, connection
   pool, storage quotas and deployment limits.
2. **Sanad activation:** the local key and real provider/model requests now pass.
   Configure the intended production server environment, redeploy, and verify
   an authenticated production request and spending limits. Available Vercel CLI
   credentials do not have access to the Diwan project; production settings
   have not been changed. Model output must not replace financial approvals.
3. **Storage operations:** verify private bucket policies and quotas, scanning /
   quarantine, retention, scheduled cleanup and coordinated database/object
   restoration. Petabyte storage requires an agreed ingestion/lifecycle plan and
   measured operational cost. Compression alone does not provision that capacity.
4. **Release operations:** additive PostgreSQL migrations 0004/0005 were applied
   transactionally on 2026-10-13; the new table has RLS and zero anon/authenticated
   grants. The private join bucket was configured and inspected. Evidence:
   `diwan-readiness-live-migrations.json`. Final deployment verification belongs
   in the current task record. Backup/restore exercises, authenticated production
   workflow checks and actual delivery receipts remain distinct operational gates.

Earlier failed runs remain in their original logs; the passing results above
supersede only the same affected checks at the recorded code state. The release
owner must update the task record with final artifact identities and remaining
gates rather than treating this dated review as ongoing verification.

# Storage review — 2026-10-13

The application stores object bytes in private Storage, with names, ownership and
object references in the database. This review does not establish support for
100,000 active users or 1,000,000 GB of stored objects.

## Verified application behavior

- New workspace attachments across tasks, expenses, assets, documents, suppliers
  and advances use optional lossless gzip within the existing 10 MiB limit. The
  original size, SHA-256 and server-generated encoding/actual stored size are
  retained. Incompressible data stays raw. Existing objects remain readable and
  are not rewritten. Comment, reimbursement and copied-asset bindings retain the
  storage metadata. Invoice extraction receives the decoded original.
- Workspace downloads validate the stored and expanded lengths and original
  checksum before exposing bytes, with a buffer bounded by the existing 10 MiB
  contract. Cancellation stops decoding and the object stream. Encoding is
  internal metadata, not an HTTP Content-Encoding header that could cause
  automatic double decoding. Originals and proofs remain byte-identical.
- Membership attachments allow 6 files, 100 MiB per file and 300 MiB per request.
  Uploads use 3 MiB parts after phone verification. Each part is checked against
  the checksum committed in the original application; retries do not duplicate
  objects or final notifications.
- Compression is lossless gzip, used only when smaller than the original part.
  Already compressed media can remain unchanged. Original documents, signatures
  and evidence are restored byte for byte; no image quality is discarded.
- Downloads verify each part before returning its bytes, read one part at a time,
  and cancel active object/decompression streams when the consumer disconnects.
  Stored manifests and decompressed output have explicit bounds. These are bounded
  part buffers, not a claim that process memory equals one part under concurrency.
- Files remain private, use attachment disposition and `nosniff`, and are subject
  to server authorization. Membership attachments remain opaque downloads; internal
  upload parts cannot be downloaded directly even by administrators.
- The Storage adapter accepts only bounded binary inputs and rejects oversized
  uploads before network access. Secrets remain on the server and redirects are
  rejected. Abandoned staged uploads are cleaned in bounded batches.

Focused evidence: `tests/join-stream.test.mjs`, `tests/join-upload.test.mjs`,
`tests/join-attachments.test.mjs`, `tests/supabase-storage.test.mjs`.
The 11 tests passed locally on Node 22.23.2 on 2026-10-13. Providers were mocked;
there were no live uploads, bucket changes or production data mutations.

Workspace compression evidence: `tests/stored-files.test.mjs` plus affected
governance/integrations/join-upload/asset tests passed 21/21 locally; compression
and governance tests also passed 11/11 against PostgreSQL-compatible PGlite on
Node 22.23.2 (2026-10-13). Tests cover all six upload resources, legacy raw reads,
tampering, decompression bounds, authorization, extraction, metadata retention,
cancellation and failed-write/lost-commit cleanup. Provider calls were mocked.

Operational indexes are generated in SQLite `0008_operational_indexes` and
PostgreSQL `0005_operational_indexes`. They cover staged-upload cleanup by type
and creation time, expense lookup by project and task, and per-record audit
history. `tests/operational-indexes.test.mjs` verifies additive application over
existing synthetic rows and query-plan index use in both engines. These local
plans are not production latency or capacity measurements. Existing migrations
remain unchanged; the new SQLite expression statement corrects a generator
comma-quoting defect while preserving its generated snapshot.

## Remaining operating gates

- Confirm the current provider's private bucket configuration and client Storage
  policies separately from database RLS. Server credentials bypass Storage RLS;
  application authorization is therefore essential for every read and write.
- Connect and verify malware scanning/quarantine before treating external files
  as safe. Checksums detect changed bytes, not malware; opaque downloads alone do
  not protect the recipient's device when opening a file.
- Establish object retention, backup and coordinated database/object restore,
  including recovery when a metadata commit or object deletion is interrupted.
- Measure upload/download concurrency, process memory, database query latency,
  provider quotas, object operations and egress under a representative workload.
  Agree capacity and cost before assuming petabyte storage is provisioned.
- The 3 MiB multipart design is intended for bounded membership uploads. One PB
  represented entirely this way would require roughly 318 million parts. That
  needs a different bulk-archive ingestion/lifecycle plan and validated metadata
  partitioning; increasing upload limits is not an adequate scaling change.
- Verify the maintenance schedule and alerting. Bounded cleanup code without an
  active scheduler does not establish a retention guarantee.

The ordinary workspace upload contract remains 10 MiB per object. This review
does not silently raise it or migrate stored files. Full application build,
cross-cutting tests and deployment verification remain the release owner's gates.

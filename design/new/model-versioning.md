# Model versioning and sharing — share-200

**Status:** Draft v0.1 — implementation plan; no feature shipped by this doc.
**Date:** 2026-11-11

**UX requirements:** [Sharing](../reqs/sharing.md), [Versions epic #57](https://github.com/bldrs-ai/Share/issues/57),
[Notes requirements](https://github.com/bldrs-ai/Share/issues/670), and their [shared index](../reqs/README.md).
These are the current UX planning drafts. Reconcile this earlier technical plan
with their unlisted-link, external-version and Notes contracts before implementation;
its public-hosting assumptions do not override the UX requirements. Existing-epic
mapping is recorded in the [Versions triage](../reqs/versions-100-triage.md); technical reconciliation and Sharing's own issue migration remain subsequent planning work. Basic history, local retention, replacement, update and backup stories belong to `versions-100` #57. Later semantic requirements retain `share-200` #2144 and [its four reconciled stories](../reqs/share-200.md); structural diff and portable Drive sidecars retain their existing epics.
**Epic / source proposal:** [#2144](https://github.com/bldrs-ai/Share/issues/2144).
**Roadmap:** [`share-200`](../roadmap.md#43-share). The former `share-200`
(grant/revoke per-principal sharing) is now `share-201`.

Share a model at an exact version, then build toward reviewable model edits in
ordinary git. Large source files stay outside git; an immutable pointer and
small versioned documents identify each revision. Importing a 900 MB IFC must
not require decomposing it into hundreds of thousands of entity files first.

This refines #2144 for implementation. **Ship whole-file history and public
version links first (V0/S1).** Progressive decomposition remains the direction
for V1–V4, subject to identity, correctness and browser measurements. A source
file plus the `create-300` document op log remains authoritative; materialized
entities must not become a second independently editable truth.

## 1. Scope and boundaries

- **V0/S1:** IFC and STEP whole-file versions; local history, explicit public
  publication, anonymous opening of a pinned version, and opt-in discovery of
  newer versions. No semantic edit dependency.
- **V1 onward:** reuse `create-300` ops; prove IFC promotion, deterministic
  checkpoints, semantic merge and eventually re-import/export. STEP stays at
  whole-file versioning until its stable-identity contract is settled.
- **Not included:** private blob storage, grants, live co-editing, rooms,
  presence, an IFC/STEP writer, or guaranteed free unlimited hosting.
- `share-201` / T4 still owns grants and revocation; `share-130` owns private
  links. A private git repo cannot make a public blob private.
- `share-110` / T2 still owns the GLB originator-share path. This feature
  publishes the **original model**, including properties and hidden content;
  it is a distinct choice, not a silent change to GLB sharing. Existing local
  viewing remains local. No automatic upload on open, save, or agent action.
- `versions-100` supplies history/navigation UI seams; `versions-300` owns
  structural diff presentation. `assist-400` may announce `(repo, commit)`;
  this layer stores settled model versions, not live conversation state.

The model-history format here supersedes the LFS suggestion in
[workspace-store.md](workspace-store.md) **for model-history repos only**.
Workspace/config/conversation persistence is not migrated by this epic. Keep
workspace model references behind `src/workspace/persistence.ts`; share the
git/OPFS investigation with that work and Collab rather than select two engines.
Existing GitHub LFS model reads remain supported.

## 2. What exists, and what must be built

Reviewed against Share main `8e406191bd2747cceeb488b927eda76ffab37dea` and the
live #2144 / #1914 discussions on 2026-11-11.

| Existing seam | Consequence for implementation |
|---|---|
| `src/routes/github.ts`, `src/routes/README.md` | GitHub routes accept a ref and source path. Add explicit version-manifest resolution; a JSON pointer is not already a loadable model. Preserve existing direct-model URLs. |
| `src/net/github/Files.js#commitFile` | Git Data API blob/tree/commit/ref writes already exist. Reuse connection/transport seams, but implement one multi-file transaction with non-force ref updates; do not upload a large base through its FileReader/base64 path. |
| `src/connections/github/GitHubProvider.ts` | Reuse the selected GitHub connection and reconnect flow. Display the acting account and repository; do not introduce a second token store. |
| `src/loader/sourceCacheKey.js`, `glbCacheKey.js`, `src/OPFS/OPFS.worker.js` | Source/cache keys mix provider paths and commit/content hashes. This is not a BLAKE3 content-addressed store. Add an explicit adapter and independent digest verification; do not reinterpret old cache keys. |
| `src/OPFS/OPFS.worker.js#clearCache` | Currently walks the OPFS root. Protect local repositories, unpublished bases and recovery records from cache clearing/eviction before V0. |
| `src/viewer/ifc/batchedEdit.js`, [model-edit.md](model-edit.md) | L0 exists; L1–L3 op log, application and persistence remain prerequisites for semantic editing. V0/S1 do not wait for them. |
| [workspace-store.md §2](workspace-store.md#2-engine-question-wasm-git-vs-isomorphic-git-open--needs-investigation) | GitHub Git Data API avoids the smart-HTTP CORS problem. Browser git engine, OPFS adapter and generic remote transport still need measurement. |

The live [#1914 correction](https://github.com/bldrs-ai/Share/issues/1914#issuecomment-6004277478)
and [#1916 identity correction](https://github.com/bldrs-ai/Share/issues/1916#issuecomment-6003491898)
take precedence over the stale source-IFC `e<expressID>` row in `model-edit.md`
§5: source **and** created IFC roots use GlobalId in persisted ops. The L1
implementation must reconcile that document before freezing its schema.

## 3. Version and repository contract

One model history per repo initially. Workspace projects reference those repos;
this is not a repo per browser session. The wire format is versioned independently
from the GLB cache schema. Reject unsupported major versions before loading.

| Path | Contract |
|---|---|
| `model.json` | Format version, stable model ID, source format/schema, base pointer path, and (V1+) op schema version plus explicit ordered active batch IDs. |
| `base/source.ptr` | Pointer version, `algorithm: blake3`, full-file digest, byte length, source media type and original filename. Filename is display metadata, never a filesystem path. |
| `mirrors.json` | Digest-to-provider/locator hints. A locator never changes the expected digest or size. No credentials, expiring signed URLs, or authorization grants in git. |
| `ops/<batch-id>.jsonl` (V1+) | Immutable batch of `create-300` document ops; file order is execution order. Batch IDs are unique, but IDs and timestamps do not define ordering. |
| `entities/<shard>/<id>.json`, `tombstones/<shard>.json` (V1 experiment) | Deterministic checkpoint of the authoritative base + active ops, accompanied by input identity, op frontier and serializer version. No independent edits to these files. |
| `bulk/<id>.ptr` (later) | Heavy semantic payloads under the same verified blob contract. |

V0 uses only the first three paths. Keep git objects small; no base bytes,
render cache, base byte-range index, tessellation or downloaded proof files in
git. Sharding and maximum object/file counts are fixed from S0/V1 measurements,
not assumed from a particular model.

**Three identities must stay separate:**

1. Blob identity = algorithm-qualified digest of the exact source bytes.
2. Version identity = repository locator + full immutable git commit object ID
   + manifest path. Git object IDs are externally visible in links, not just
   internal implementation details; do not hard-code a claim that all git uses
   one hash algorithm.
3. Semantic state identity (V1+) covers schema/serializer versions, base,
   active ordered ops, and any validated checkpoint including tombstones.
   `(base hash, overlay tree hash)` alone is insufficient. Compaction equality
   compares resolved semantic state, not git tree hashes, which will change.

## 4. Local durability and commit transactions

Run hashing, blob I/O and git work in workers with bounded buffers and progress/
cancellation. A browser can lack OPFS or sufficient quota: keep ordinary viewing
available, explain that local version saving is unavailable, and do not report
a version as saved in a temporary memory-only fallback.

Separate durable local documents from rebuildable caches. Cache eviction and
Clear cache must preserve local repos, active source bytes, unpublished versions
and pending transactions. Browser site-data deletion can still erase OPFS;
offer a backup/export of the repo **and referenced blobs** and report remote
publication separately from local save. `navigator.storage.persist()` is a
request, not a durability guarantee.

Use one writer per repo across workers/tabs (Web Locks or an experimentally
verified equivalent). Stage source bytes and small documents, verify size and
digest, flush/close data, then create the commit and advance the local ref last.
A transaction journal makes interruption/retry idempotent. Recovery exposes
either the previous complete version or the new complete version, never a ref
to a partially written base. Do not assume a multi-file OPFS write is atomic.
Maintain blob pins across repos, pending imports and publishes; cache cleanup
must coordinate with those pins and the writer lock.

V0 import creates a pointer commit; importing a replacement creates a new base
revision. An identical base with identical manifest metadata is a no-op. The
original bytes never change, and V0 does not infer semantic ops from re-import.

## 5. Public publishing, opening and following

**Initial remote recommendation:** a user-selected, user-controlled public
GitHub repo using its Git Data API for the small metadata tree. Do not require
a generic smart-HTTP proxy for S1. S0 must prove permissions, repo creation or
selection, CORS, request counts and rate-limit behavior with the existing
connection flow. Never force-push or silently change an existing repo's visibility.

**Blob hosting is an S1 gate.** #2144 proposes Hugging Face datasets and
Bldrs-operated iroh nodes. Neither is established infrastructure by this plan.
Evaluate them against HTTP/browser upload and download, authentication, quotas,
terms, retention, resumable transfers and operational ownership. A native iroh
peer is not automatically a browser HTTP mirror. Select and document one
working provider before shipping; keep a provider interface so R2 or another
store can be added without changing blob identity. No promise of permanent or
free storage until that service policy exists.

Local and remote git representations must preserve commit object IDs. The S0
transport spike must round-trip parents, trees, author/committer metadata and
messages through the Git Data API, not create a different remote history while
claiming it is the local one.

Publication is a recoverable transaction:

1. Show the file, size, destination, acting accounts, and that the **entire
   original model becomes public and copies cannot reliably be recalled**.
   Require explicit confirmation before the first public byte is uploaded.
2. Upload all blobs needed by the versions exposed in the published history,
   not only the tip; verify completion and anonymous readability at the selected
   provider. Resolve any shallow-history boundary before claiming those older
   versions are available. Persist resumable progress.
3. Upload small git objects and create the commit with the expected parent.
   Advance the remote branch with a non-force fast-forward update. On a race,
   preserve the local version and fetch the new head; V0/S1 offer retry/fork,
   not automatic whole-file merge or overwrite.
4. Confirm the commit and dependencies can be read before enabling Copy link.
   If remote success is ambiguous, query the expected commit/ref before retrying.
   An orphan upload is recoverable; a broken link is never presented as success.

The share URL uses the existing GitHub route family, with a **full commit ID**
and an explicit manifest path (for example `…/<commit>/model.json`). Route
recognition must check the versioned manifest schema rather than treat arbitrary
JSON as a model. Camera/selection fragments remain optional view state. They
never change the pinned model version. Resolve and record the exact commit
when opening a branch-based discovery link; generate pinned links thereafter.

An anonymous recipient fetches the manifest at that commit, validates its
bounded schema and pointers, downloads the base to a staging file in bounded
chunks, verifies its full digest and size, then hands the verified source to
the existing loader. V0/S1 do not promise first render before full verification.
Reopen may use the validated local blob and ordinary derived GLB cache.
For historical commits created offline without mirror hints, use the repo's
current mirror catalogue or a configured provider's digest lookup as discovery
only. Treat that catalogue as untrusted location hints: it cannot change the
digest/size pinned by the historical pointer. This also permits mirror repair
without rewriting published history.

**Follow is explicit.** Remember a branch separately from the pinned version,
offer a newer version, and switch only on user action. Never mutate the URL's
meaning or overwrite local work. A rewritten/deleted branch is an unavailable
or divergent history, not permission to substitute another model. Commit author
metadata is attribution, not proof of the author's identity; write access comes
from the provider. Public readers need no GitHub login, while API limits still
need a visible retry path.

## 6. Integrity, ranges, chunking and retention

- A BLAKE3 digest verifies a **complete byte sequence**. A plain HTTP Range
  response plus that digest cannot verify a range independently. V2 range
  reads require a specified authenticated proof format (for example Bao),
  trusted root, proof generator, browser verifier and mirror support; test
  corruption, truncation, wrong offsets and servers that ignore Range.
- A content-defined chunk store is a separate optimization. V0 may store a
  whole blob and record its full-file BLAKE3 identity. Defer custom chunking;
  benchmark provider-native dedup first. If chunking is adopted, version the
  algorithm/parameters and bind ordered chunk lengths and hashes in an
  authenticated manifest. Keep full-file identity independent of the chunker.
  The proposed 64 KiB–1 MiB bounds / 256 KiB average are a benchmark candidate,
  not a compatibility contract or a claimed dedup result.
- Remote range access also needs an engine/source adapter. Today's windowed
  engine reads use synchronous sources and may scan a file repeatedly; a proof
  format does not by itself make the existing renderer lazily network-backed.
- Mirror failover must preserve digest/size; reject corrupt bytes and try the
  next permitted mirror. Credentials belong to the provider adapter and must
  not be forwarded to arbitrary manifest URLs or redirect origins. Validate
  URLs, paths, sizes and counts; reject traversal and unsupported schemes.
- Keep blobs reachable from supported history, published version pins and
  pending transactions. A shallow clone cannot determine global reachability.
  Do not implement destructive remote GC in V0/S1. Before later GC, define who
  owns the roots, branches/tags/forks, published-link retention and a grace period.
  Compaction does not authorize deleting bases needed by older commits.
- Hashes prove integrity, not availability or confidentiality. An optional
  IPFS CID is an alias with a verification mapping, not the BLAKE3 digest under
  another spelling. An unpinned network copy is not a backup.

## 7. Semantic versions: preserve one authority

V1 reuses the `create-300` op schema and resolver. Only `layer: document` ops
are persisted; view/residency ops stay out. Store explicit active batch order
and cursor/undo outcome so a commit replays the state the sender actually saw.
One completed user action is one transactional batch; a drag need not commit
every pointer move. Unknown op/schema versions fail closed rather than replay
part of a model. Actor/time metadata extends the shared schema once, not a
second competing op format.

**Identity gate:** IFC roots use model-scoped GlobalIds, including source
roots. Duplicate/missing IDs must be detected. Owned non-root data may travel
with its owning root; shared or cyclic data requires an explicit reference and
copy-on-write rule. Content hashes identify immutable values, not mutable
entities. Hashing a placement does not give it stable identity after an edit.
Do not persist express IDs, byte offsets or render instance IDs as durable
entity identity. A base-scoped index may use them internally. Do not guess
ownership or clone shared materials/placements without a proven closure rule.

Promotion reads and serializes the affected semantic closure, including
references, in the same transaction as the ops. A tombstoned ID resolves as
deleted **before** any overlay/base fallback; an ID present in both a live
checkpoint and tombstones is invalid. Canonical bytes specify key and collection
ordering, numeric representation/units, string handling, references and schema
version; ordinary JSON.stringify with sorted top-level keys is insufficient.

Start with replay-only persistence. V1 measures an optional materialized
checkpoint against that oracle: replay(base, active ops) must equal the
checkpoint's resolved state. Load a checkpoint only when its input/frontier
and serializer match; on mismatch discard/rebuild the derived checkpoint,
never silently choose it over the log. If remote consumers can edit arbitrary
repo files, enforce this validation there as well. Persisted checkpoints become
a release requirement only if measurements justify the complexity.

**Merge (V3):** uniquely named batch files avoid textual append conflicts but
do not solve operation ordering, duplicate replay or semantic conflicts.
Find the common ancestor, derive each branch's active ops, deduplicate op IDs,
and build a single validated result with explicit order/checkpoint frontier.
Conflicting writes, delete-vs-edit, shared-dependency changes and competing base
replacements stop for resolution. Even disjoint root edits require reference
and schema/placement/unit validation. Plain git JSON merge is not acceptance.

**Compaction (V3):** manual only. A validated full semantic snapshot can become
a new replay starting point with an explicit cutoff; retain prior history.
Do not drop the base pointer until the snapshot contains *all* semantic data,
including untouched non-rendered entities, and the equality test passes. A
partial render overlay is not a complete IFC model.

**Round trip (V4):** exporting edited IFC/STEP still requires a Conway writer.
Re-import matching by GlobalId also needs duplicate/missing-ID handling and
conflict policy; unmatched non-root/STEP data must not generate guessed edits.
Evaluate IFC JSON work, IfcOpenShell merge tooling, Speckle and Xet with current
sources and fixtures before adopting their identity/merge/storage conventions.

## 8. Milestones and acceptance gates

S0 is added to resolve the original plan's ordering gap: S1 is a browser
feature, so the minimal browser storage/transport work cannot wait until V2.
All production changes start behind a dedicated flag; its off path preserves
existing save/open/share behavior. UI stories require desktop **and** mobile
E2E through `describeMobileAndDesktop`. Large-fixture performance runs are
separate reproducible benchmarks, not every small CI test.

| Milestone | Dependencies and deliverable | Exit evidence |
|---|---|---|
| **S0: contracts and feasibility** | Freeze V0 schemas; test worker git/OPFS adapter, protected storage and GitHub API transport; select blob provider for S1. | Browser matrix with versions, memory/quota behavior, interruption recovery, transport/auth limits and provider retention/operating policy. No provider is marked selected without a working upload + independent anonymous read. |
| **V0: local whole-file history** | S0 local contracts; bounded-memory import/hash/store/commit and version picker for IFC + STEP. | Import/reimport/reopen two versions; old bytes remain identical; offline reopen; clear-cache safety; quota/cancel/crash recovery; concurrent-tab writer test. 900 MB IFC benchmark plus a STEP fixture. |
| **S1: public version links** | V0 + S0 provider/remote decision; confirm/upload/publish/open, then explicit newer-version discovery. | A publishes; anonymous B in a clean browser opens the same verified source and view; A publishes again, old link stays pinned, B opts into new version. Cover corruption, unavailable mirror, lost auth, ref race and retry; no premature link or implicit public upload. |
| **V1: semantic prototype** | `create-300` L1–L3 contracts and its scope prerequisites (#1704/#1710); prove identity/closure on real IFC data, initially headless. | Replay/undo/cursor equivalence; deletion, shared references and deterministic checkpoint bytes; cold parse/cache-hit state agree. Report repo growth, file counts, replay and checkpoint costs. STEP remains whole-file. |
| **V2: browser semantic integration** | V1; select measured checkpoint strategy and library; remote range adapter/proofs only if justified. | V1 session persists/reopens in browser and reaches B through a pinned link; measure memory, responsiveness, clone/fetch and first render. No partial-clone assumption. |
| **V3: semantic merge and compaction** | V2 + semantic conflict/GC-root contracts. | Independent edits merge and replay once; conflicts block publication; references remain valid; compaction preserves semantic state and every retained historical version opens. |
| **V4: round trip** | Conway writer + identity/matching policy. | Canonical export/re-import fixtures preserve semantics; externally edited IFC produces explainable ops or explicit unresolved matches. |

Record cold/warm import time, incremental peak memory, hash/upload throughput,
bytes stored/transferred, git object/file counts, commit/replay latency and
recipient first-render time on named devices/browsers. S0 establishes numerical
budgets before feature agents start; this document does not invent benchmark
results. The Phase C under-two-second GLB aspiration is not a cold 900 MB
source-download acceptance criterion.

Expected refusals (cancel, quota, offline, conflict, reconnect) get actionable UI
and coarse analytics as appropriate. Corrupt published data or a broken hosted
dependency gets one actionable Sentry report through the page, following the
repo's Reported Conditions policy. No model names, URLs, digests, author emails
or tokens in telemetry. Workers return structured errors. Each implementation
PR specifies the actual condition mapping and tests it.

## 9. Dispatch plan

These are planning packages, not claims that implementation agents or acceptance
evidence already exist. Before coding, use the [reconciled UX owners](../reqs/versions-100-triage.md#requirements-migration-and-source-ownership): basic Versions stories belong to #57 and later semantic/publication stories to #2144. Only formal UX stories are direct native epic children; keep new tasks as story-body checkboxes and attach existing implementation issues beneath their clearly owning story. Keep cross-story support linked outside the epic's direct children. Use the owning epic prefix plus a user-visible story title. Each dispatch
includes the current branch/SHA, live issue/comments, exact files, numerical
test baseline, acceptance fixtures and stop conditions per
[agent-workflow.md](agent-workflow.md). Re-read the dependencies; L0 alone does
not establish an op-log implementation.

| Package | Agent scope / output | Dependencies / stop condition |
|---|---|---|
| **A — format and storage spike** | V0 manifest/pointer fixtures, worker git engine comparison, OPFS layout + locking/recovery/backup design, 900 MB import measurements; inspect `src/OPFS/` and `src/loader/`. | Can start now as investigation. Stop before a production format if memory/durability gates fail; report evidence, not an in-memory fallback called durable. |
| **B — publication spike** | GitHub Git Data API transaction prototype with existing connections; evaluate proposed blob hosts, anonymous reads and resumable upload; propose provider, limits and ownership. | Can run alongside A using isolated fixtures. Public test uploads use explicitly public fixtures only. No infrastructure purchase or permanent service commitment is implied. |
| **C — local history** | Implement V0 using A's frozen contracts, storage protection and recovery; version picker, IFC/STEP fixtures and tests. | A accepted. Owns shared OPFS/cache edits; other agents must not edit those files concurrently. |
| **D — recipient resolver** | Manifest-aware route and verified blob resolution; preserve view fragments and existing direct-model routes; offline/retry/error tests. | A contracts + B provider interface. Can run alongside C in disjoint route/transport files; coordinate loader integration. |
| **E — publish and follow UI** | Confirmation, acting account, staged publish state machine, Copy link, update discovery; desktop/mobile two-user tests. | B, C, D integrated. Stop on unresolved hosting/retention policy; no silent fallback to a public mirror. |
| **F — semantic identity/overlay study** | Align #1916 identity and op schema, non-root closure fixtures, replay/checkpoint oracle and file-count benchmarks. | Research can parallel A/B; production V1 waits for L1–L3 and scope contracts. No second log or Conway writer project hidden in this task. |

**First dispatch:** A and B, with F as a bounded research task if capacity
allows. Then C/D, E, and the measured V1 decision. Keep provider selection,
git-engine selection and overlay promotion as explicit decisions with evidence;
do not block V0 on compaction, custom chunking or semantic merge.

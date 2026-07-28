# Workspace store — the repo-as-workspace direction

**Status:** v0.1 — direction agreed in principle; nothing below is
committed scope. This doc exists so the thinking survives; the T10
conversation-store decision and `ai-workspace.md` (roadmap §7.4 AI.0)
will consume it.
**Date:** 2026-07-28
**Owner:** Pablo

The question this answers: what are we persisting, where, and what's the
exit plan? Today's answer is three ad-hoc pots — localStorage JSON docs
(recents, workspace Tier 1), OPFS blobs (model cache), and Auth0
`user_metadata` as a Tier-2 sync target. That's fine for a projects
list; it does not scale to what the AI-workspace pivot needs: config,
projects, conversation threads, and model references, versioned and
syncable, with a user-private / team / public split.


## 1. The direction

**Treat OPFS as a normal workspace filesystem, versioned with git, and
persist everything except large blobs.**

- The workspace is a git repo living in OPFS: config files, project
  structs, conversation transcripts, model *references* — all plain
  files with history.
- Large model blobs stay out of history, exactly as they'd be out of a
  server-side repo via LFS. The repo stores pointer files; OPFS doubles
  as the content-addressed blob cache it already almost is.
- Sync is `git push`/`pull` to any remote. For GitHub-backed users this
  means **no new backend**: a private repo is the workspace store, and
  LFS on that repo is the blob store — consistent with the §2.2
  "no new backend" theme and the product's BYOS shape.

**Why this and not a database:** the exit plan becomes a property of the
design rather than a promise. A user's workspace is a plain git repo —
`git clone` *is* data liberation. Share is already git-native (GitHub as
primary source, sha-anchored permalinks, Versions UI); this rhymes with
everything the product does.

### 1.1 The audience split

- **Machine-local** (caches, device prefs): `.gitignore`. Ignore rules
  separate tracked from untracked — the right tool for exactly this and
  nothing more.
- **User-private vs team vs public**: git has no per-file ACL, so
  audience boundaries are **repo/remote boundaries** — a private
  workspace repo vs shared project repos — not ignore rules. v0 may
  approximate "user-private = untracked + mirrored to Auth0", knowing
  that's a stand-in for repo separation, not the end state.
- **Auth0 `user_metadata` shrinks to a bootstrap record**: identity
  prefs + pointers to the user's workspace remotes. The §2.2 constraints
  hold (small-JSON, per-user, read-at-login, sync target not live DB) —
  this direction makes it *more* minimal, not less.

### 1.2 The blob tier

Don't invent a middle tier — **adopt the git-lfs pointer format**. If
the repo stores real LFS pointer files and OPFS is the content-addressed
cache, then any LFS-capable remote (GitHub) is already the blob store.
A bldrs-hosted S3-compatible endpoint becomes just another LFS backend
for anonymous/no-GitHub users, and is deferrable until something pulls
on it.

### 1.3 Record vs stream — where conversations live

Git is the right store for artifacts, config, project history, and
*settled* conversation. It is the wrong transport for live multi-user
chat: snapshot-and-merge, no push, no presence, merge noise under
concurrent appenders. Matrix's event DAG is essentially "git for chat"
built for real-time.

So the division is:

- **The repo is the durable, canonical project record.**
- **The ChannelProvider is the live layer** (matrix.org / Discord /
  Slack — epic assist-400, `conversational-cad.md` §5).
- **Distillation connects them**: streams checkpoint into the repo —
  thread → file, like minutes into a logbook.

AI conversation fits the same shape: the live exchange is a stream, the
kept transcript is a file. This is the requirements overlap between the
single-user convo panel (assist-310) and multi-user channels
(assist-400), made structural.


## 2. Engine question: wasm-git vs isomorphic-git (open — needs investigation)

Either way this is an infrastructure project, not a dependency you add.

- **wasm-git** (libgit2 → wasm): more complete git semantics. Costs:
  browser→GitHub smart HTTP needs a CORS proxy (known territory —
  `git.bldrs.dev`); libgit2's partial-clone/promisor support is limited;
  the emscripten-FS↔OPFS bridge needs a worker + `syncAccessHandle` to
  perform.
- **isomorphic-git** (pure JS): easier to embed, weaker merge, no
  rebase. **Prior finding to re-verify:** this came up before, and the
  recollection is that isomorphic-git lacked git-2 wire/protocol
  semantics, which among other things caused shallow-clone trouble.
  Needs a real investigation with citations before the engine is chosen.

The investigation should produce: protocol-v2 support status in both,
shallow + partial clone behavior against GitHub through a CORS proxy,
merge fidelity, OPFS throughput, and bundle-size cost.

### 2.1 The rival to name: CRDTs

Automerge/Yjs beat git for *concurrent small-document edits* (two people
touching project config, live cursors); git beats CRDTs for history,
audit, blobs, and interop. The mature answer is often hybrid — CRDT for
the live doc, checkpointed into git — which slots into the record/stream
split above (CRDTs live on the stream side). The eventual decision doc
must treat CRDTs as a considered adoption or rejection, not an omission.


## 3. Packaging: a separate engine repo, eventually

The instinct: a standalone repo akin to conway — roughly "matrix.org's
Hydrogen + wasm-git": a versioned local store plus a sync/replication
layer, product-independent and testable headless.

Agreed, with one caution from our own history: engine version-lag has a
documented cost here (`adapter-removal.md`). So **prove the API seam
inside Share first** — a `workspace/store` boundary, of which
`src/workspace/persistence.ts` is the embryo — and extract to its own
repo once the interface stops moving, not before.


## 4. What this costs today: almost nothing, given two habits

Everything Tier 1 persists is already a serializable document behind one
seam; "JSON doc in localStorage" → "file in a repo" is a `mv`, not a
migration. To keep it that way:

1. **All new persistence goes through the `workspace/persistence.ts`
   seam, document-shaped.** Never a second bespoke store.
2. **Conversation logs are file-shaped from day one.** When the convo
   tray stub (#1672) lands, its per-model/per-project log should be
   stored as a JSONL-style document the repo store can adopt wholesale.

Nothing in the shipped Tier-1 work (#1684) fights this direction.


## 5. Relationship to existing plans

- **T10 conversation store** (roadmap §10): this doc is the sharpened
  input; the record/stream split (§1.3) is the proposed answer shape.
- **`ai-workspace.md`** (roadmap §7.4 AI.0, not yet drafted): owns the
  final storage decision alongside runtime/provider/sandbox; its storage
  section should consume this doc rather than restate it.
- **ChannelProvider** (`conversational-cad.md` §5): unchanged; this doc
  assigns it the stream side of the split.
- **§2.2 persistence tiers**: Tier 1 (localStorage) and Tier 2 (Auth0)
  stand as shipped/planned; this is the tier *behind* them once the
  workspace outgrows a projects list.


## 6. Open questions

1. Engine: wasm-git vs isomorphic-git (§2 investigation, with the
   git-2-semantics recollection verified or retired).
2. CRDT adoption/rejection for the live-doc layer (§2.1).
3. Multi-tab coordination (single writer via Web Locks?) and OPFS quota
   / `navigator.storage.persist()` behavior across browsers.
4. Anonymous users: local-only repo until sign-in, then push to a
   created remote? Where does the anonymous blob tier live before then?
5. E2EE for private convo distillation if channels are Matrix-backed.
6. Are channels and Notes one primitive or two (roadmap §10, restated).

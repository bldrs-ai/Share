# Multi-user sharing: alignment across Drive and GitHub

**Status:** Proposed
**Date:** 2026-05-07
**Owner:** Pablo
**Related design docs:**
- [`identity-decoupling.md`](./identity-decoupling.md) — promotes GitHub to a `ConnectionProvider` peer of Drive; this proposal assumes that shape.
- [`drive-recents-head-check.md`](./drive-recents-head-check.md) — typed pre-flight + typed alert pattern; this proposal extends both.

**Related code:** `src/connections/`, `src/Components/Connections/`, `src/Components/Open/`, `src/net/github/`, `src/routes/`, `src/Components/Notes/`


## Problem

Today the app can *open* a model someone else owns, but only if that person already shared it through the underlying provider's UI (Drive's share modal, GitHub's collaborators page). Bldrs has no in-app concept of "share this model with X." Several adjacent capabilities are also missing or asymmetric across the two providers we support:

| Capability | Drive today | GitHub today |
|---|---|---|
| Pick a model from my account | ✓ Picker | ✓ Browser |
| Pick from shared drives / multiple orgs | partial (`driveId` wired, no UI) | ✓ org list |
| Persisted, cross-tab tokens | ✓ (`bldrs:gdrive-token:*`) | partial — Auth0 SPA cache only |
| Server-side revocation check | ✓ `tokeninfo` on Sources mount (#1497) | ✗ |
| In-app grant to a user / group | ✗ | ✗ |
| In-app link-visibility toggle | ✗ | ✗ (GH has no link-share; only repo public/private) |
| Folder-scoped browse boundary | partial (Sources folder for browse only) | ✗ |
| Visibility indicator (public/org/private) | ✗ | ✗ |
| Comments | ✗ | ✓ Issues + Comments backend |
| Versions | ✗ | ✓ branches / tags / commits |
| Reconnect UX on token loss | ✓ (#1498/#1499) | ✗ |
| Anonymous load | ✓ via API key | ✓ via raw URL |
| File-unreachable handling | proposed in [`drive-recents-head-check.md`](./drive-recents-head-check.md) | not addressed |

The two PRs of recent infrastructure work — [`identity-decoupling.md`](./identity-decoupling.md) and [`drive-recents-head-check.md`](./drive-recents-head-check.md) — give us the substrate to close most of these. Identity decoupling means *every* per-source operation (browse, share, revoke) flows through a `Connection` rather than through primary Auth0 identity, so a sharing API has a single shape that works for one Drive account, one GitHub account, or several of each side-by-side. The HEAD-check pattern gives us the typed-error + typed-alert vocabulary we need for sharing's success and failure surfaces.

This doc proposes the alignment plan that builds on both.


## Proposal

Three orthogonal axes, each backed by a small extension to the `ConnectionProvider` interface defined in `src/connections/types.ts:94`:

1. **Grant / revoke / list grants** — share the model with another principal.
2. **Visibility** — read and (for owners) toggle public/org/private state.
3. **Boundary** — encode a folder/repo-path scope into the route so the in-app navigation can refuse to climb above it.

A fourth axis — **comments and versions** — is provider-asymmetric and lives in §Stretch.


### 1. Sharing as a `ConnectionProvider` capability

Extend `ConnectionProvider` with optional sharing methods. Mirrors how `checkFileAccess` was added in [`drive-recents-head-check.md`](./drive-recents-head-check.md): optional, default no-op, providers that can implement it do.

```ts
interface ConnectionProvider {
  // ...existing fields from src/connections/types.ts:94...

  /** List grants on a resource. */
  listGrants?(connection: Connection, resource: ResourceRef): Promise<Grant[]>

  /** Add a grant. principal is provider-shaped: email/domain for Drive, login/team for GH. */
  shareWith?(connection: Connection, resource: ResourceRef, grant: GrantRequest): Promise<Grant>

  /** Remove a grant. */
  revokeGrant?(connection: Connection, resource: ResourceRef, grantId: string): Promise<void>

  /** Read visibility; null when not knowable from the API. */
  getVisibility?(connection: Connection, resource: ResourceRef): Promise<Visibility | null>

  /** Owner-only: change visibility. */
  setVisibility?(connection: Connection, resource: ResourceRef, v: Visibility): Promise<void>
}

type ResourceRef =
  | { kind: 'drive-file', fileId: string }
  | { kind: 'drive-folder', folderId: string, driveId?: string }
  | { kind: 'github-repo', org: string, repo: string }
  | { kind: 'github-tree', org: string, repo: string, branch: string, path?: string }

type Visibility = 'private' | 'org' | 'public'

interface GrantRequest {
  principalType: 'user' | 'group' | 'domain' | 'anyone'
  principalId?: string                    // email | domain | gh-login | team-slug
  role: 'reader' | 'commenter' | 'writer' | 'owner'
  notify?: boolean                        // Drive sends email by default; GH always emails
  message?: string                        // Drive supports; GH ignored
}

interface Grant {
  id: string
  principalType: GrantRequest['principalType']
  principalId?: string
  role: GrantRequest['role']
  origin: 'drive' | 'github' | 'bldrs'    // bldrs = sidecar grant; see §Stretch
}
```

#### Drive adapter
- `listGrants` → `drive.permissions.list({fileId, fields: 'permissions(id,type,role,emailAddress,domain)'})`.
- `shareWith` → `drive.permissions.create({fileId, body, sendNotificationEmail, emailMessage})`. Maps `principalType` to Drive's `type`. `'anyone'` toggles link-share.
- `revokeGrant` → `drive.permissions.delete`.
- `getVisibility` → derived: `org` when an `application/domain` permission exists matching the user's Workspace domain; `public` when an `anyone` permission exists; `private` otherwise.
- `setVisibility('public')` → adds an `anyone` `reader` permission. `setVisibility('org')` → requires the user to supply a domain (the Drive Connection metadata already has `email`, so we infer the default domain). `setVisibility('private')` removes both.
- All calls reuse the existing `googleDriveProvider.getAccessToken(connection)` flow; nothing new in the auth layer. `drive.file` scope is sufficient because the resource was picker-acquired or app-created.

#### GitHub adapter (assumes the [`identity-decoupling.md`](./identity-decoupling.md) `GitHubProvider` lands)
- `listGrants` for `github-repo` → `GET /repos/{org}/{repo}/collaborators` + `GET /repos/{org}/{repo}/teams`.
- `shareWith` user → `PUT /repos/{org}/{repo}/collaborators/{username}`. team → `PUT /orgs/{org}/teams/{team}/repos/{org}/{repo}`. `'anyone'` is rejected (no link-share at file granularity).
- `revokeGrant` → matching `DELETE`.
- `getVisibility` → `GET /repos/{org}/{repo}` `private` flag → `private` or `public`. `org` is "internal" repos on GH Enterprise; surface that when the field is present.
- `setVisibility('public')` → `PATCH /repos/{org}/{repo} {private:false}` with a strong confirmation modal (irreversible publish). `private` and `org`/`internal` likewise.

#### UI surface
A new `ShareDialog` reachable from the loaded model and from each `RecentFilesList` row. Shape:

- Header: model name + visibility chip (the same chip from §2 below).
- Tabs / segmented control: **People & groups** | **Link**.
- People panel: list current grants (`listGrants`), input row to add (autocomplete from Sources Connection metadata where possible — Drive contacts API is gated, so v1 just accepts free-text email/domain/login/team-slug + a role dropdown).
- Link panel: provider-specific. Drive shows the link-share toggle and "Anyone with the link can {view|comment|edit}". GitHub explains "GitHub shares at repo level" and links to §1's repo-visibility action.
- A footer makes the acting identity explicit: *Sharing as `pablo@bldrs.ai` — Drive*. If multiple connections of the same provider exist, the user can switch (this is exactly the `identity-decoupling.md` motivating case: two GitHub accounts in Sources).

Errors route through the typed-error pattern: `GrantFailedError`, `InsufficientPermissionError`, `NeedsReconnectError` (already exists), with `AlertDialog` variants modelled on `fileUnreachable`.


### 2. Visibility chip + viewer-side affordances

Read-only first; mutate from the Share dialog above.

- New `RouteResult.visibility?: Visibility` set lazily by the Share component after first load.
- Title-bar chip: 🔒 Private / 🏢 Org / 🌐 Public, with a tooltip explaining who can see this file.
- When an anonymous viewer hits a private permalink the existing fetch fails 401/403; we already have `NeedsReconnectError` and (per [`drive-recents-head-check.md`](./drive-recents-head-check.md)) `FileUnreachableError` with `reason: 'forbidden'`. The change here is that the alert body distinguishes the two: *forbidden* = "ask owner to share with you" with copy-share-link affordance; *needs reconnect* = current Reconnect button.
- When the visibility is `public`, an anonymous viewer is never prompted to sign in.

This axis costs essentially zero new infrastructure once the `getVisibility` provider method exists.


### 3. Folder-scoped routes

The honest constraint: neither provider grants below file-level (Drive) or repo-level (GitHub). What we *can* do is enforce a navigation scope inside Bldrs so that a viewer of a folder-share doesn't get an in-app door to the rest of the user's Drive or repo.

Route extensions:

- Drive: `/share/v/g/f/{folderId}/{fileId}` — viewer is locked to `folderId`; the in-app file picker / breadcrumbs only show files inside that folder. Uses the Drive `parents` field check we already query.
- GitHub: add a boundary marker to the existing `/share/v/gh/{org}/{repo}/{branch}/...` schema. Use `//` to split boundary path from leaf, matching the `splitAroundExtensionRemoveFirstSlash` style already in `src/Filetype`. So `/share/v/gh/acme/bim/main/projects/towers//05-mech.ifc` locks browse to `projects/towers/`.
- The Sources tab and Open dialog refuse to navigate above the boundary when the route's boundary segment is set.

Critical caveat to put in the UI copy and docs: **this is a UX boundary, not a security boundary** — anyone with the underlying access can read sibling files via Drive's or GitHub's own UI. We are honest about that.

Drive does have one true scope: a folder grant (`drive.permissions.create` with `folderId` + `type: 'user'`) restricts the recipient's actual access in Drive itself. The Share dialog should call this out: "Share this folder with X" produces a folder grant *and* the boundary route, so the UX boundary and the security boundary line up.


### 4. Provider parity follow-ups (small)

- **GitHub token-health parity.** Mirror `tokeninfo`/Sources mount validation: call `GET /user` on Sources mount, route 401 to `NeedsReconnectError`. Falls naturally out of [`identity-decoupling.md`](./identity-decoupling.md) because the GitHub `ConnectionProvider` will own a real `checkStatus`.
- **Shared-Drive picker UI.** `driveId` is wired in `GoogleDriveBrowser.ts:59-71` but no UI exists to switch corpus. Add a "Drive: My Drive | Shared Drives ▾" selector to the Picker pre-flow.
- **Public-discovery surface.** Out of v1 scope. A per-org feed of public Bldrs-published models is a separate proposal.


## Migration

Pure additive. No existing routes change meaning. Existing recents continue to resolve. The Share dialog is reachable but optional — users who never click it see today's behavior.

Schema additions:
- `RouteResult.visibility?: Visibility`.
- Optional `ConnectionProvider` methods: `listGrants`, `shareWith`, `revokeGrant`, `getVisibility`, `setVisibility`.
- New typed errors in `src/connections/errors.ts`: `GrantFailedError`, `InsufficientPermissionError`.
- New `AlertDialog` variants: `grantFailed`, `cannotShare`, `visibilityChanged`.
- New routes: `/v/g/f/:folderId/*` and the `//` boundary split in `/v/gh/...`.

Telemetry from day one: count Share dialog opens, grants created (per provider), public toggles. Calibrates whether the alignment was worth the surface area.


## Alternatives considered

- **Build sharing only on the Bldrs side**, using a server-side ACL, ignoring Drive/GitHub permissions. Decoupled and uniform, but two competing access systems (Drive's real one + ours) is a footgun: a user revokes in Drive and we keep showing the file because our DB still grants. Provider-native sharing wins on truthfulness.
- **Treat GitHub repo-visibility toggle as the only "share" surface there**, no in-app collaborators API. Simpler, but loses the strongest GH multi-user case (add a teammate to a private repo from inside Bldrs). Worth doing in v1.
- **Make Drive folders the only sharing unit.** Conceptually clean (folder = boundary = grant), but most users open single files from recents; forcing them to share a folder is friction. Support both file and folder, default to file.
- **Defer until the comments/versions stretch is figured out.** Tempting because the stretch is conceptually larger, but visibility + grant are independently valuable and don't wait on it.


## Scope

Sequenced PRs. Each lands behind a `sharing` feature flag.

1. **Provider sharing scaffolding.** Extend `ConnectionProvider` interface; implement Drive adapter (`listGrants`, `shareWith`, `revokeGrant`, `getVisibility`, `setVisibility`); typed errors. No UI. Lands behind flag. Depends on nothing.
2. **Share dialog UI (Drive).** Reachable from title bar + recents row. People panel + Link panel. Visibility chip. Behind flag.
3. **GitHub sharing.** Implements GH adapter once [`identity-decoupling.md`](./identity-decoupling.md) PR-1 lands. Same Share dialog surfaces it; "Sharing as" footer becomes meaningful with multiple GitHub connections. Behind flag.
4. **Folder-scoped routes.** Route schema extension; in-app boundary enforcement; Share dialog "share folder" path. Behind a separate `folder-boundary` flag.
5. **Token-health parity for GitHub.** Small; mirrors Drive's `tokeninfo` pattern. Independent of the rest.
6. **Flag retirement** after metrics show the dialog being used and not regressing the open path.

Estimated effort: PR1–PR3 ≈ 1 week each with reviews; PR4 ≈ 1–2 weeks (route schema discussion); PR5 ≈ 1–2 days.


## Stretch — comments and versions, with portable git-importable formats

Drive has neither comments nor versions in our stack today; GitHub has both via Issues/Comments and branches/commits. Closing this gap *generically* — and making the result round-trip to git — is multi-quarter work. Treat as a development program, not a sprint.

### Sidecar formats (Q1)

Two JSON files stored alongside the model:

- `<model>.bld-notes.json`: ordered list of notes, each `{id, parentId|null, authorEmail, authorName, createdAt, updatedAt, markdown, anchor: {ifcGuids?, camera?, screenshotUrl?}, status, provenance: {provider, originId}}`. Anchors reference IFC `GlobalId` so notes survive re-export of the same model.
- `<model>.bld-versions.json`: `{versions: [{id, parentId|null, createdAt, author, message, contentRef}]}`. `contentRef` is `{kind:'drive', revisionId} | {kind:'git', sha} | {kind:'blob', sha256}`. The git mapping is identity (commit SHA = version id).

Both formats:
- Carry a `schemaVersion` and a JSON-Schema, validated by a small CLI in `tools/bld-notes/`.
- Have a flat-Markdown projection (`notes/<id>.md` with YAML frontmatter) for git-friendly diffing and PR review.
- Embed `provenance` so an import knows where each record came from and can round-trip without dup'ing.

### Drive backend (Q2)

A `NotesProvider` interface lifts the existing `src/Components/Notes/` UI off the GH-backed implementation. The Drive backend writes `<model>.bld-notes.json` next to the model. `drive.file` scope already permits this for picker-acquired files. Reads cache the JSON in IDB; writes are append-then-rewrite with optimistic concurrency on `etag`.

### Versions for Drive (Q3)

`drive.revisions.list` enumerates Drive's native revisions per file. We maintain `<model>.bld-versions.json` mapping our version ids ↔ Drive revisionIds. UI shows a version timeline parity with what GitHub already gets natively from `git log`.

### Round-trippers (Q4)

- **Promote to Git.** From a Drive model: create a new GH repo (via `identity-decoupling`'s GitHub Connection), push the model + sidecars, import notes into Issues (preserving `bldrs-id:<uuid>` markers in issue bodies), import versions as commits/tags.
- **Snapshot to Drive.** Reverse: serialize Issues/Comments → sidecar JSON, snapshot a chosen ref's tree to a Drive folder.
- Conflict UX: notes edited on both sides since last sync surface a `notesConflict` `AlertDialog` variant; resolution uses the markdown projection so a human can three-way-merge in their editor of choice.

### Stretch quarters

| Quarter | Scope |
|---|---|
| Q1 | Schemas + JSON-Schema validators + round-trip CLI in `tools/bld-notes/`. No UI. |
| Q2 | `NotesProvider` abstraction; Drive backend; UI parity with GH-backed notes. |
| Q3 | Versions for Drive via Revisions API + manifest; versions UI parity. |
| Q4 | Promote-to-Git + Snapshot-to-Drive migrators; conflict UX. |
| Stretch+ | Per-note ACLs (Drive sidecars in sub-folders with their own grants); CRDT for offline comment editing; notes federation across providers. |

Q1 is honestly a discovery sprint: the schemas need real model data to firm up. Subsequent quarters resize once Q1 is concrete.


## Open questions

- **Permissions audit log.** Should we persist a Bldrs-side log of grant/revoke events for an audit trail, or rely entirely on the providers' own audit logs (Drive's activity API, GitHub's audit log for orgs)? Provider-native is simpler and doesn't drift; Bldrs-side gives us cross-provider analytics. Lean provider-native for v1.
- **`drive.file` scope ceiling.** A file shared *to* a viewer cannot be opened from a permalink under `drive.file` until the viewer opens the Picker once and selects it. This is intrinsic to the scope choice in `b72a53c`. Document in the share-link UX: "the recipient must open this in Drive once to grant Bldrs access on their account." Workaround would be widening to `drive.readonly`, which we explicitly stepped away from.
- **GitHub Enterprise `internal` visibility.** `org` maps cleanly to `internal` for GHE users but is undefined on github.com personal/team plans. Show `org` only when `internal` is a valid setting for the repo's owner.
- **Share-link revocation feedback.** When a viewer's access is revoked mid-session, today we discover it on next API call. Sources-mount validation catches stale tokens; should we periodically re-`getVisibility` to catch stale grants? Probably not in v1 — too chatty — but flag the pattern.
- **Identity attribution on grants.** A grant added by Bldrs is attributed to the acting `Connection`'s user in Drive/GitHub's own audit log. The Bldrs-side telemetry should also record the Auth0 user (the "P" identity) so we can correlate. Coordinate with the quotas work flagged in [`identity-decoupling.md`](./identity-decoupling.md)'s open questions.
- **Folder-boundary route stability.** If a Drive folder is renamed or moved, `folderId` is stable but the breadcrumb display name isn't. Do we cache the name in the route, or look it up live? Live lookup is honest but adds a request to the boundary check; cached is brittle. Probably live, with the cached name as a hint.

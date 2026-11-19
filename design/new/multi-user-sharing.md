# Multi-user sharing: provider grants and visibility for Drive and GitHub

**Status:** Tracked in `share-t100` [#2203](https://github.com/bldrs-ai/Share/issues/2203). PR1 (the interface and the Drive adapter, [#1505](https://github.com/bldrs-ai/Share/pull/1505)) is merged. PR5 (GitHub token health) shipped with the identity-decoupling work. The rest has not started.
**Date:** 2026-11-18
**Owner:** Pablo

Related: [`identity-decoupling-decisions.md`](./identity-decoupling-decisions.md) (GitHub as a `ConnectionProvider` peer of Drive), [`model-versioning.md`](./model-versioning.md) (`share-200`'s link resolver and version manifest). The text before this rewrite, including the PR plan, the open questions and the old comments-and-versions Stretch section (now `notes-t200` [#2204](https://github.com/bldrs-ai/Share/issues/2204)), is at [commit 8c28c7d](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/design/new/multi-user-sharing.md).


## Problem

Share can open someone else's model only if the owner already shared it in Drive's or GitHub's own UI. Share can't name who may see a model, show who can see it, or keep a folder's viewer out of the rest of the owner's Drive or repo. The providers hold the real access rules, so this design reads and changes them through each signed-in `Connection`. One account or several of each provider work the same way.


## What Share links mean

A private Share link is `share-200`'s unguessable token from the link resolver ([#2144](https://github.com/bldrs-ai/Share/issues/2144), [`model-versioning.md`](./model-versioning.md)). It is **not** Drive's "Anyone with the link" permission, and GitHub has no link-share at all. When Share's UI says "Anyone with the link", it means the `share-200` token.

Provider link-share is just the `public` visibility state. Share never uses it for a private link: quota counting treats a link-shared Drive file as public, so such a link would be metered as public.

The surfaces this design serves belong to three epics:

| Surface | Epic |
|---|---|
| Private-by-default links and the visibility chip | `share-130` [#2206](https://github.com/bldrs-ai/Share/issues/2206) |
| Naming people and groups (the people panel, provider grants) | `share-201` [#2207](https://github.com/bldrs-ai/Share/issues/2207) |
| Folder-scoped routes | `share-400` [#2208](https://github.com/bldrs-ai/Share/issues/2208) |

Dialog layout, chip copy and alert wording live in those epics, not here.


## The sharing interface

**Decision: sharing is five optional methods on `ConnectionProvider`.** A provider implements what it can, and callers check a method exists first. Each takes the acting `Connection` and a `ResourceRef`, so each provider reuses its own token flow and the auth layer is untouched.

The contract is in [`src/connections/types.ts`](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/src/connections/types.ts#L94):

```ts
listGrants?(connection, resource: ResourceRef): Promise<Grant[]>
shareWith?(connection, resource: ResourceRef, grant: GrantRequest): Promise<Grant>
revokeGrant?(connection, resource: ResourceRef, grantId: string): Promise<void>
getVisibility?(connection, resource: ResourceRef): Promise<Visibility | null>
setVisibility?(connection, resource: ResourceRef, v: Visibility): Promise<void>

type ResourceRef =
  | {kind: 'drive-file'; fileId: string}
  | {kind: 'drive-folder'; folderId: string; driveId?: string}
  | {kind: 'github-repo'; org: string; repo: string}
  | {kind: 'github-tree'; org: string; repo: string; branch: string; path?: string}

type Visibility = 'private' | 'org' | 'public'

interface GrantRequest {
  principalType: 'user' | 'group' | 'domain' | 'anyone'
  principalId?: string   // email | domain | GitHub login | team slug
  role: 'reader' | 'commenter' | 'writer' | 'owner'
  notify?: boolean
  message?: string
}

interface Grant {id, principalType, principalId?, role, origin}
```

`getVisibility` returns `null` when the API can't tell, never a guess.

**Typed errors** are in [`src/connections/errors.ts`](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/src/connections/errors.ts):

- `NeedsReconnectError`: HTTP 401, the token was revoked.
- `InsufficientPermissionError`: HTTP 403, the user may not do this.
- `GrantFailedError`: anything else. Its `cause` is a short tag such as `http_500`, `wrong_provider` (a Drive helper asked about a GitHub resource, or the reverse), `domain_unknown` or `unsupported`.

Transport lives in a `*Sharing.ts` file that takes an explicit token; the provider delegates to it ([`GoogleDriveProvider.ts`](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/src/connections/google-drive/GoogleDriveProvider.ts#L459)). One wrapper (`driveFetch`) maps HTTP status to the typed errors. GitHub gets the same shape: `GitHubSharing.ts` with a `githubFetch` wrapper.


## Drive adapter

Shipped in [`GoogleDriveSharing.ts`](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/src/connections/google-drive/GoogleDriveSharing.ts). Files and folders are treated the same: both have a `permissions` collection.

- `listGrants`: `permissions.list` with `supportsAllDrives`, fields `id,type,role,emailAddress,domain`.
- `shareWith`: `permissions.create`. `principalType` maps one-to-one onto Drive's `type`. Email notification flags are forwarded only where Drive accepts them.
- `revokeGrant`: `permissions.delete`.
- `getVisibility` is derived from the grants. Any `anyone` permission means `public`, and `public` wins over `org`. A `domain` permission for the connection's own domain means `org`. A domain permission when the connection's domain is unknown means `null`. Anything else means `private`.
- `setVisibility` reads the current grants first, so it is idempotent. `public` adds an `anyone` reader. `org` adds a reader for the connection's domain. `private` removes `anyone` and same-domain grants but keeps named users and groups, because a private file can still have collaborators.
- **The connection's domain comes from its email.** Free-email domains (`gmail.com`, `outlook.com` and the like) count as unknown, so `setVisibility('org')` throws `domain_unknown` rather than grant to every Gmail user. Share does not lean on Drive's own refusal of such grants.


## GitHub adapter

Not built. GitHub shares at repo level, so a `github-tree` resource shares through its repo.

- `listGrants`: `GET /repos/{org}/{repo}/collaborators` and `GET /repos/{org}/{repo}/teams`.
- `shareWith`: a user is `PUT /repos/{org}/{repo}/collaborators/{username}`. A team is `PUT /orgs/{org}/teams/{team}/repos/{org}/{repo}`.
- `revokeGrant`: the matching `DELETE` on the same paths.

It differs from Drive in four ways:

- **`getVisibility` is one `GET /repos/{org}/{repo}`** that reads the `.private` field. Unlike Drive, it is not derived from `listGrants`.
- **An `anyone` principal is rejected** with `GrantFailedError` (cause `unsupported`). GitHub has no link-share; a repo is only public or private.
- **`setVisibility` is `PATCH /repos/{org}/{repo}`.** Making a repo public is close to irreversible. The strong confirmation belongs in the UI, not the adapter, which only makes the call.
- **`org` maps to GitHub Enterprise's `internal` visibility.** Offer it only when the repo's `internal` field is present. On github.com personal and team plans, `org` is not selectable.


## Visibility semantics

**Decision: visibility is three provider-neutral states read from the provider, never stored by Share.**

- `private`: only the owner and named grants.
- `org`: everyone in the owner's Workspace domain (Drive) or Enterprise (GitHub `internal`).
- `public`: anyone. For Drive this includes link-shared files.

**Drive `getVisibility` already feeds quota counting.** [`src/quota/driveVisibility.js`](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/src/quota/driveVisibility.js#L58) calls it, unflagged, to decide whether a Drive load is metered as private ([`quotas.md`](./quotas.md) §"Drive visibility"); on `null` it falls back to an API-key download check. Changing these semantics changes quota counting, so change both together. (The `sharing` flag in `src/FeatureFlags.js` gates nothing.)


## Folder-scoped routes

**Decision: a route can carry a boundary that Share's own navigation will not climb above.**

- Drive: `/share/v/g/f/{folderId}/{fileId}`. The file picker and breadcrumbs show only files under `folderId`, checked against the file's `parents`.
- GitHub: a `//` in the existing `/share/v/gh/{org}/{repo}/{branch}/...` path splits the boundary from the leaf, in the style of `splitAroundExtensionRemoveFirstSlash` in `src/Filetype.js`. So `/share/v/gh/acme/bim/main/projects/towers//05-mech.ifc` keeps browsing inside `projects/towers/`.
- The Sources tab and Open dialog refuse to go above the boundary when it is set.

**Caveat: this is a navigation boundary, not a security boundary.** Neither provider grants below file level (Drive) or repo level (GitHub). Anyone with the underlying access can read sibling files in Drive's or GitHub's own UI, and the UI must say so. The one exception is a Drive folder grant, which does limit the recipient's real access. Sharing a folder should create both the folder grant and the boundary route, so the two line up.

`folderId` survives a rename or move, but the folder's name doesn't. Look the name up live, with any cached name only as a hint.


## Alternatives rejected

- **A Share-side access list that ignores provider permissions.** Uniform, but it makes two competing access systems. A user who revokes in Drive would still see Share grant the file. Provider-native grants stay true.
- **Provider link-share as Share's private link.** It is metered as public, GitHub has none, and it can't be revoked per recipient. Share mints its own token instead (`share-200`).
- **Only the repo-visibility toggle on GitHub.** Simpler, but it loses the main GitHub case: adding a teammate to a private repo from inside Share.
- **Folders as the only sharing unit on Drive.** Clean, but most users open single files from recents. Support files and folders, and default to files.
- **A Share-side audit log of grants.** The providers' own audit logs don't drift.


## Lasting constraints

- **The `drive.file` scope ceiling.** Under `drive.file`, a viewer can't open a file shared to them from a permalink until they pick it once in the Google Picker. This comes from the scope choice in `b72a53c`. Widening to `drive.readonly` would remove it, and Share chose not to. `drive.file` is enough for the owner's side: it lets Share read and change the permissions of files the owner picked or Share created.
- **No grants below file level (Drive) or repo level (GitHub).** Folder routes are navigation only, except where a Drive folder grant backs them.
- **Grants are attributed to the acting `Connection`'s user** in the provider's audit log, not to the Auth0 user.
- **GitHub `org` exists only on Enterprise.**
- **Revocation is noticed on the next API call.** Share does not poll visibility during a session.

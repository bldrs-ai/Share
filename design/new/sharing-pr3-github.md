# Sharing PR3: GitHub adapter — implementation notes

**Status:** Not started. Unblocked by identity-decoupling PR1 (#1507) and PR2 (#1508), which together stand up `GitHubProvider` as a `ConnectionProvider` peer of Drive. PR3 is the sharing methods on that provider.

Parent design: [`multi-user-sharing.md`](multi-user-sharing.md). This doc records the carry-over context needed to start a clean PR3 session without re-deriving design.


## What PR1 (#1505) already provides — reuse, don't redefine

- `ConnectionProvider` exposes the five optional sharing methods (`listGrants`, `shareWith`, `revokeGrant`, `getVisibility`, `setVisibility`) — `src/connections/types.ts`.
- `GrantFailedError`, `InsufficientPermissionError`, `NeedsReconnectError` — `src/connections/errors.ts`.
- `ResourceRef` already has `github-repo` and `github-tree` variants.
- `Visibility`, `GrantRequest`, `Grant` types are provider-neutral and final.
- The `'wrong_provider'` cause-string convention is established (Drive helpers reject GitHub resources with this; GH helpers should reject Drive resources the same way).
- Factoring pattern: a separate `*Sharing.ts` transport file plus provider-object delegation, mirroring `GoogleDriveBrowser.ts` / `GoogleDriveSharing.ts`. Do `GitHubSharing.ts` the same way.
- The 401/403/4xx-5xx → typed-error mapping pattern lives in `driveFetch` (in `GoogleDriveSharing.ts`). Mirror it as a `githubFetch` wrapper.
- Tests use direct `global.fetch` stubs, not MSW. See `GoogleDriveSharing.test.ts` for the shape.


## Where the GitHub adapter genuinely diverges from Drive

- **`getVisibility`** is a single `GET /repos/{owner}/{repo}` reading the `.private` field. It does **not** derive from `listGrants` like Drive's does. Cleaner.
- **`'anyone'` principal** must be rejected with `GrantFailedError(cause: 'unsupported')`. GitHub has no link-share at the repo level — only repo-public/private.
- **`setVisibility('public')`** flips repo `private:false` via `PATCH /repos/{owner}/{repo}`. The design requires a strong confirm modal — that lives at the **UI layer in PR2's Share dialog**, not in the adapter. The adapter just performs the call.
- **`'org'`** maps to GHE `internal`. Surface this option only when the `internal` field is present on the repo (i.e. owner is an org with GHE-internal available). On github.com personal/team plans, this visibility is not selectable.


## Endpoints (per parent design doc)

- `listGrants` for `github-repo`:
  - `GET /repos/{org}/{repo}/collaborators`
  - `GET /repos/{org}/{repo}/teams`
- `shareWith` user: `PUT /repos/{org}/{repo}/collaborators/{username}`
- `shareWith` team: `PUT /orgs/{org}/teams/{team}/repos/{org}/{repo}`
- `revokeGrant`: matching `DELETE` on the same paths.


## Starting a PR3 session

1. Confirm identity-decoupling has landed — look for `src/connections/github/GitHubProvider.ts`. If absent, identity-decoupling is the prerequisite work.
2. Mirror the `GoogleDriveSharing.ts` file layout. Lift `driveFetch`'s error-mapping pattern into a `githubFetch` wrapper that returns typed connection errors.
3. Write the sharing methods one at a time with their tests; reuse the `GoogleDriveSharing.test.ts` shape (direct `global.fetch` stubs).
4. Wire `githubProvider` to delegate the five methods to the new transport file.

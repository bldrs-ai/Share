# Drive recents: HEAD-check before navigate

**Status:** Proposed
**Date:** 2026-05-07
**Owner:** Pablo
**Related code:** `src/Components/Open/OpenModelDialog.jsx`, `src/Components/Connections/SourcesTab.jsx`, `src/connections/google-drive/GoogleDriveBrowser.ts`, `src/Containers/CadView.jsx`


## Problem

When a user clicks a Drive file in the recents list and the underlying file no longer exists or is no longer shared with this account, the load fails late and noisily:

1. Click recent → `onOpenById` pre-flights `getAccessToken` (PR #1498) and navigates to `/v/g/<fileId>`.
2. CadView mounts, calls `getFileDownload(connection, null, fileId)`.
3. Google Drive API returns 404 (deleted) or 403 (revoked share).
4. The IFC loader receives a non-IFC body or empty blob and `viewer.load()` fails.
5. CadView's outer `if (!tmpModelRef && !isOOM)` branch fires `setAlert('Failed to parse model')`.

The user sees a generic parse error for what is actually a "this file is gone or not shared with you anymore" situation. They have no path forward except guessing — and the recent entry stays in the list, ready to fail the same way next time.

The fix that lets us close the deep-link case (typed `NeedsReconnectError` + Reconnect overlay) doesn't help here because this isn't an auth failure. The token is fine; the file just isn't reachable.


## Proposal

Pre-flight a Drive metadata HEAD/GET before navigating, and surface a typed alert with a clear remediation if the file is unreachable.

### Where the check lives

In `OpenModelDialog.handleOpenById` (the recent-file click path), immediately after the existing `getAccessToken` pre-flight:

```js
const handleOpenById = async (connection, fileId, fileName) => {
  const provider = getProvider(connection.providerId)
  if (provider) {
    try {
      await provider.getAccessToken(connection)        // existing
      await provider.checkFileAccess(connection, fileId) // new
    } catch (err) {
      if (err instanceof NeedsReconnectError) { ... }   // existing
      if (err instanceof FileUnreachableError) {
        setAlert({
          type: 'fileUnreachable',
          connection: err.connection,
          fileId: err.fileId,
          fileName,
          reason: err.reason, // 'not_found' | 'forbidden'
        })
        return
      }
      ...
    }
  }
  // navigate as before
}
```

`provider.checkFileAccess(connection, fileId)` does a `GET https://www.googleapis.com/drive/v3/files/<fileId>?fields=id,name,trashed`:
- 200 + `trashed=false` → return.
- 200 + `trashed=true` → throw `FileUnreachableError(connection, fileId, 'trashed')`.
- 404 → throw `FileUnreachableError(connection, fileId, 'not_found')`.
- 403 → throw `FileUnreachableError(connection, fileId, 'forbidden')`.
- Other status → return (don't block on transient flakes).

### UI surface

`AlertDialog` learns a third typed alert variant: `fileUnreachable`. Header reads `File not available`. Body contains the filename and a contextual reason ("This file was deleted from Drive" / "You no longer have access to this file" / "This file is in the Drive trash"). Actions:

- **Remove from recents** (primary): calls a new `removeRecentFileEntry({connectionId, fileId})` on `connections/persistence`, then closes the alert.
- **Try a different account** (secondary, only when the user has multiple Drive connections): closes the alert, leaves the Open dialog up, scrolls to the Sources tab. The user picks another connection and re-clicks the file in *that* recent list.

### Same check on deep-link / reload

Deep-link (`/v/g/<fileId>` typed in URL bar, no preceding click) hits the same Drive 404/403 inside CadView's `loadModel → getFileDownload`. Today that surfaces as "Failed to parse model"; with this change, `getFileDownload` is the natural place to throw `FileUnreachableError`, CadView's outer catch routes it the same way it routes `NeedsReconnectError`, and `AlertDialog` shows the same `fileUnreachable` overlay. Only difference vs. the recents click: "Remove from recents" is a no-op (we navigated in directly, not via a recent click) — replace it with "Open another file" that closes the alert and routes back to the Open dialog.


## Cost / latency

One Drive metadata GET per recent click. Empirically ~150–300ms for healthy Drive API. Critique: this slows the happy path for a UX win on the unhappy path.

Two mitigations:

- **Run the metadata GET in parallel with navigation, not before it.** Fire the request inside the click handler, but kick off `navigate` immediately. CadView's load and the metadata check race; if the metadata check returns 404/403 first, route to the unreachable overlay; if the load succeeds first, ignore the late metadata response.
- **Skip the check when we have a strong recency signal.** If the recent's `lastAccessedAt` is < N minutes ago (e.g. 60), assume it's still reachable and skip the metadata GET. Most clicks are repeat opens of recently-loaded models; the failure mode mostly affects long-stale recents.

**Recommendation: ship the in-series version first.** The 150–300ms cost is small relative to model-load time (multi-second for non-trivial IFC files), and serializing avoids a race that's harder to reason about. Optimize to parallel/skip-recent only if telemetry shows the latency mattering.


## Alternatives considered

- **Don't pre-flight, improve only the post-load error UI.** Catch the 404/403 inside CadView's load chain and route to a typed alert there. Cheaper; no extra request. But the user has already paid the navigation + viewer-init cost before we tell them the file is gone, and removing a stale recent requires bouncing back to the dialog. Worse UX, especially on slow networks.
- **Pre-flight on dialog mount, not on click.** Validate every recent's reachability when the Open dialog opens. Pro: greys out unreachable recents before the user clicks. Con: N requests on every dialog open, most of which are wasted because the user clicks at most one. The on-click variant has better cost shape.
- **Do nothing; trust the user to figure it out.** What we do today. The cost of "Failed to parse model" surfacing for non-parse problems has come up multiple times.


## Migration

Pure additive. No schema changes. Adds:

- `FileUnreachableError` class in `src/connections/errors.ts` next to `NeedsReconnectError`.
- `checkFileAccess` method on the `ConnectionProvider` interface (optional; default implementation is a no-op for providers that don't support it). GitHub's provider when it lands will have its own version.
- `removeRecentFileEntry({connectionId, fileId})` in `connections/persistence`.
- `fileUnreachable` alert variant + handler in `AlertDialog`.

Tests:
- `GoogleDriveProvider.checkFileAccess` returns / throws on 200, 404, 403, trashed=true, network error.
- `OpenModelDialog.handleOpenById` skips navigation and surfaces the typed alert when `checkFileAccess` throws `FileUnreachableError`.
- `AlertDialog` renders the unreachable header + body + Remove-from-recents action; click invokes `removeRecentFileEntry`.
- `CadView.loadModel`'s outer catch routes `FileUnreachableError` to `setAlert({type:'fileUnreachable',...})`.


## Scope

Single PR. Estimated 1–3 days including tests.


## Open questions

- **Trashed handling.** A trashed file is technically reachable via `?supportsAllDrives=true&includeItemsFromAllDrives=true&trashed=true`, and the user could conceivably recover it. Do we treat `trashed=true` as `fileUnreachable` (simplest) or surface "this file is in your trash, restore it"? First version: treat as unreachable; revisit if anyone asks.
- **Shared Drives.** The metadata endpoint behaves differently for files in Shared Drives. Need to add `?supportsAllDrives=true` to the query and confirm 404/403 semantics match. Verify against a Shared Drive file in a manual test.
- **Rate limits.** Drive's metadata endpoint is cheap but rate-limited per-user. If a user has a recents list with hundreds of entries and we move to the dialog-mount pre-flight variant later, we'd want batching. Not relevant for the on-click design.
- **Telemetry.** Worth tagging `fileUnreachable` events in analytics so we can see how often the unhappy path fires before vs. after this lands. The before/after delta calibrates whether the latency cost was worth it.

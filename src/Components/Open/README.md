# Open — Component Design

The Open subsystem lets users load models from multiple sources. It is
surfaced as a toolbar button that opens a tabbed dialog.

## Component tree

```
OpenModelControl
└── OpenModelDialog
    ├── Tabs (Local | Google* | GitHub | Samples)
    ├── [Local tab]
    │   └── RecentFilesBrowseSection   (recent files + Browse button)
    ├── [Google tab]*
    │   └── SourcesTab
    │       ├── ConnectProviderButton  (first-time connect)
    │       ├── RecentFilesBrowseSection
    │       └── ConnectionCard
    ├── [GitHub tab]
    │   ├── RecentFilesBrowseSection   (when authenticated)
    │   └── GitHubFileBrowser          (cascading selectors)
    │       ├── Selector               (Org, Repo, Branch, File)
    │       └── SelectorSeparator      (Folder — shows current path)
    └── [Samples tab]
        └── SampleModels               (chip grid of public models)

GoogleDrivePickerDialog                (rendered outside Dialog, activated
                                        after SourcesTab hands back a token)
```

`*` Google tab is gated behind the `googleDrive` feature flag.

## Entry point: `OpenModelControl`

Renders a `ControlButtonWithHashState` toolbar button. When the dialog
becomes visible it fetches the authenticated user's GitHub organisations so
`GitHubFileBrowser` has them ready. Dialog visibility is stored in Zustand
(`isOpenModelVisible`) and reflected in the URL hash (`#open:`).

## `OpenModelDialog`

Owns all tab state and model-loading callbacks. Responsibilities:

| Concern | Detail |
|---|---|
| Tab list | `[Local, Google*, GitHub, Samples]`; tab index in Zustand `currentTab` |
| Local open | `loadLocalFile` / `loadLocalFileFallback` → OPFS → navigate `/v/new/<filename>` |
| Local recents | `loadRecentFilesBySource('local')` on dialog open |
| Google open | Two paths: picker (`handlePickerSelect`) or direct by id (`handleOpenById`) → both navigate to `/v/g/<fileId>` |
| GitHub recents | `loadRecentFilesBySource('github')` on dialog open |
| GitHub browse | Shows `GitHubFileBrowser` via `showGithubBrowser` slide transition |
| Recent persistence | `addRecentFileEntry` on every successful open; keyed by source |

### Google Drive flow

1. `SourcesTab` calls `onPickerReady(token, connection)` → dialog hides,
   `GoogleDrivePickerDialog` activates (modal outside the dialog stack).
2. User picks a file → `handlePickerSelect` navigates to `/v/g/<fileId>`.
3. Alternatively, user clicks a recent file → `handleOpenById` navigates
   directly without re-authenticating.

On page reload the OAuth token is restored from `sessionStorage`
(`gdrive_token_<connectionId>`) so re-authentication is not required.

## `GitHubFileBrowser`

Cascading async selectors: Org → Repo → Branch → Folder → File.

- Each selection triggers a GitHub API fetch that populates the next level.
- **Selector** supports an optional `validate` prop that adds an
  "Enter name..." escape hatch for typed input (debounced, shows
  Found/No match feedback).
- **SelectorSeparator** is a variant that shows the accumulated `currentPath`
  as its display value and emits `<No subfolders>` when the folder list is
  empty.
- "Open" is disabled until a supported file extension is selected
  (`pathSuffixSupported`).

## `Selector` / `SelectorSeparator`

Reusable controlled dropdowns.

| Prop | Purpose |
|---|---|
| `list` | Options array |
| `selected` | Controlled index (number) or typed string |
| `setSelected` | Called with index from dropdown or string from Other… mode |
| `validate` | `async (string) => boolean` — enables Other… text entry |
| `emptyText` | Shown at full opacity when `list` is empty (default `<None>`) |

`SelectorSeparator` additionally accepts `displayValue` to show an arbitrary
string (e.g. current folder path) regardless of the selected index.

## `SampleModels`

Static chip grid of public reference models hosted on GitHub. Navigates
immediately on click; no authentication required. Always quota-free (see
below).

## `hashState`

`HASH_PREFIX_OPEN_MODEL = 'open'` — the dialog is opened by appending
`#open:` to the URL, and `isVisibleInitially()` reads this on first render.

---

## Usage Quotas

Private-model loads (local, Drive, private GitHub) are metered per tier to
create a sign-up / upgrade moment; public and sample content is never counted.
**The full design — tiers and limits, the 30-day rolling window, the
server-authoritative `record-load` gate, GitHub public/private detection, the
OPFS local fallback, and the `quotas` feature flag — lives in
[design/new/quotas.md](../../../design/new/quotas.md).** This section covers
only how the Open dialog surfaces and wires it.

### UI surfaces

The check fires when a private load is *initiated* (before navigation), never
mid-session on an already-loaded model.

| Usage level | UI behaviour |
|---|---|
| 0 % used | Silent — no quota UI |
| ≥ 50 % | Subtle badge on the Open toolbar button ("N of M used") |
| ≥ 75 % | Same badge, amber |
| Over limit | `QuotaLimitDialog` (value prop + sign-up / upgrade CTA) instead of navigating |

`QuotaBadge` wraps the `OpenModelControl` toolbar button so the dialog stays
uncluttered; it hides whenever `limit === Infinity` (paid tier, or the `quotas`
flag off). `QuotaLimitDialog` links to `/share/quotas`.

### Gating wiring

`useQuota()` exposes `{used, limit, tier, hasCapacity, record}`. Every load site
— Drive picker + recents, local file + recents, GitHub recents + browser, sample
chips, drag-and-drop — gates in this order:

1. **`hasCapacity`** — cheap client check; if already over, open
   `QuotaLimitDialog` and stop (no consent popup, no server round-trip).
2. **`provider.getAccessToken`** (Drive / GitHub only) — token preflight
   *inside* the click handler, before any other `await`, so a GIS consent popup
   keeps its user-gesture activation. Navigating or awaiting `record()` first
   loses the gesture → `popup_failed_to_open`. See the comment in
   `handleOpenById`.
3. **`record(key)`** — the authoritative gate; on `403` open `QuotaLimitDialog`
   instead of navigating, otherwise add the recent and navigate.

When the `quotas` flag is off (the default) `useQuota` reports unlimited
capacity and `record()` is a no-op, so every load site above is inert.

### Files (this subsystem)

| File | Role |
|---|---|
| `QuotaBadge.jsx` | Usage badge overlaying `OpenModelControl` |
| `QuotaLimitDialog.jsx` | Over-limit value-prop modal |
| `src/hooks/useQuota.js` | Hook over the lib + `record-load` |
| `src/quota/quota.js` | Core lib — see [design/new/quotas.md](../../../design/new/quotas.md) |

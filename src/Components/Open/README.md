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

### Goals

Limit anonymous and free-tier use of *private* model loading to create a
natural conversion moment toward sign-up and paid subscription, without
blocking public/sample content that drives discovery.

### What counts as a private load

| Source | Private? |
|---|---|
| Local file (DnD or Browse) | Always |
| Google Drive | Always |
| GitHub — private repo | Yes |
| GitHub — public repo | No |
| Samples | Never (always free) |

The unique key for deduplication is the **URL / file identifier**:
- Local: filename as stored in OPFS (`/v/new/<filename>`)
- Google Drive: Drive file ID (`/v/g/<fileId>`)
- GitHub: full share path (`/v/gh/<org>/<repo>/...`)

Reloading the same model does not consume a new quota slot.

### Tiers

| Tier | Private model quota | Reset | Conversion CTA |
|---|---|---|---|
| Anonymous (no account) | 2 lifetime | Never | "Sign up free — 4 models/month" |
| Free account (signed in) | 4 / month | 1st of month following first use | "Upgrade for unlimited" |
| Paid subscription | Unlimited | — | — |

Anonymous gets a lifetime cap of 2 (not monthly) so the conversion moment
arrives early, while the user is engaged, rather than after a month gap.

### Storage

Quota state is persisted in OPFS as `quota.json` (alongside model files).
Schema:

```json
{
  "tier": "anonymous" | "free" | "paid",
  "resetDate": "2026-05-01",
  "loads": [
    {"key": "/v/g/1BxABC...", "loadedAt": "2026-04-03T10:00:00Z"},
    {"key": "/v/new/mymodel.ifc", "loadedAt": "2026-04-03T10:05:00Z"}
  ]
}
```

On app start: if `today >= resetDate` and tier is `free`, clear `loads` and
advance `resetDate` by one month.

For signed-in users, quota state will eventually be mirrored to Auth0 user
metadata for cross-device consistency (future work).

### Progressive UX

The quota check runs at the moment a private model load is *initiated*
(before navigation), not after.

| Usage level | UI behaviour |
|---|---|
| 0 % used | Silent — no quota UI shown |
| ≥ 50 % (1 of 2 / 2 of 4) | Subtle badge on the Open toolbar button — "N of M free models used" |
| ≥ 75 % (last slot) | Same badge, slightly more prominent (amber) |
| Limit reached | Modal: value proposition + sign-up / upgrade CTA |

The badge lives on `OpenModelControl` (the toolbar button), keeping the
dialog itself uncluttered.

**Limit modal copy (anonymous):**
> You've opened 2 models. Sign up free to open 4 models per month and sync
> your recent files across devices.
> [Sign up free] [Not now]

**Limit modal copy (free tier):**
> You've opened 4 models this month. Upgrade for unlimited private models,
> priority loading, and team sharing.
> [Upgrade] [Not now]

A model that is already loaded is never blocked mid-session — the gate only
fires on initiating a new load.

### Planned implementation files

| File | Role |
|---|---|
| `src/OPFS/quota.js` | Read / write / check quota state in OPFS |
| `src/hooks/useQuota.js` | React hook: exposes `{used, limit, check, record}` |
| `src/Components/Open/QuotaBadge.jsx` | Badge overlay on `OpenModelControl` |
| `src/Components/Open/QuotaLimitDialog.jsx` | Upgrade / sign-up modal |

`OpenModelDialog` calls `quota.check(key)` before navigating; if over limit
it opens `QuotaLimitDialog` instead. On successful load it calls
`quota.record(key)`.

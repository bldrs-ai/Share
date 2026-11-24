# Open 100 triage

**Reconciliation date:** 2026-11-23. **Evidence commit:** [`2154a8d`](https://github.com/bldrs-ai/Share/commit/2154a8d9a38408160a775a7e32d9259c9950d457). **Result:** five epic issues created, nine formal stories placed (seven reused, two new), their bugs nested beneath them. No runtime acceptance is claimed.

The [scope snapshot](open-100.md) has the motivation and the story list. This record keeps the evidence behind it. Tasks, progress and open decisions live in the epics ([#2258](https://github.com/bldrs-ai/Share/issues/2258)–[#2262](https://github.com/bldrs-ai/Share/issues/2262)) and their stories. The [rubric](ux-rubric.md) sets the procedure.

## Epics, tier and aliases

None of the five had a tracker: the roadmap's §3.1 rows for `open-100`, `-110`, `-120`, `-130` and `-300` linked no issue. They were created on 2026-11-23, labelled `epic` and `enhancement`, as `open-200` and `open-210` were. The roadmap's short names and the epics' titles differ in wording (for example "Open from GitHub URL / UI" and "Open a model from GitHub"); the roadmap rows now use the titles.

**Tier.** No code or band changed.

- `open-100`, `-110`, `-120`: the 1xx basic journey, shipped.
- `open-130`: a variation on them, so also in the 100 band, though not on §6.0's MVP list (owner, 2026-11-18).
- `open-300`: the 3xx band, Phase B, with `identity-t100`.

**Aliases.** The roadmap's [ID lineage](../roadmap.md#id-lineage) covers the numbers: Recents was `open-150` (v0.2–v0.4), `open-130` (v0.5), `open-200` (v0.6–v0.16) and is `open-130` again since v0.17; the Sources tab was `open-130` (v0.2–v0.4) and `open-300` since v0.5. Issue titles use an older, separate scheme. The 2023–24 stories were titled "Open 100 - …" and "Open 200: …", where "Open 100" meant any basic open and "Open 200" the second wave (tabbed dialog, LFS, AP214 and multi-format). That "Open 200" is not the workspace epic `open-200`. Titles still using it were left alone, except where an issue was retitled below.

## Inventory

Searched on 2026-11-23 with the GitHub search API, `repo:bldrs-ai/Share is:issue`, open and closed: `open-100`, `open-110`, `open-120`, `open-130`, `open-300` and `open-205` (title and body), `"Open 100"`, `"Open 110"`, `"Open 120"`, `"Open 130"`, `"Open 300"` (title), and the topics `recents`, `recent`, `drive`, `google drive`, `gdrive`, `archive`, `zip`, `LFS`, `drag and drop`, `sample`, `stl`, `unsupported`, `"open dialog"`, `OpenModelControl`, `multi-account`, `"Sources tab"` and `private repo`. Each result set was read; none was marked incomplete. The roadmap's §4.1 (before it was retired; see [roadmap §4.1 at `2154a8d`](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/design/roadmap.md#41-open)) and its ID lineage, `design/new/drive-recents-head-check.md`, `identity-decoupling-decisions.md` and `#2202`'s body were read for the epics' scope.

## Milestones

Expanded through the repository's milestone list (state `all`). These matched the Open family; everything not named in the table is out of scope and unchanged.

| Milestone | Members | Placed |
|---|---|---|
| [47 Open 100: Open sample model](https://github.com/bldrs-ai/Share/milestone/47) | 4 | #757 (story), #761 and #1136 beneath it; #1136 is a pull request, so it is an evidence link, not a child. #1183 is a closed bug. |
| [48 Open 100: Open project from GH link](https://github.com/bldrs-ai/Share/milestone/48) | 5 | #765 (story), #1223 beneath it; #1139 is a pull request. The rest are closed bugs. |
| [52 Open 100: open model on GH via open UI](https://github.com/bldrs-ai/Share/milestone/52) | 3 | #1159 (story), #666 beneath it. #1087 went to #1962, because a `.txt` sibling file is not a GitHub problem. |
| [57 Open 200: Tabbed Open dialog](https://github.com/bldrs-ai/Share/milestone/57) | 8 | #1229 and #1215 (open bugs of the GitHub tab) beneath #1159. The closed tabbed-dialog work (#1179, #1190, #1195) and #756 are baseline history, unchanged. |
| [56 Open 200: Enable LFS for a repo](https://github.com/bldrs-ai/Share/milestone/56) | 2 | Deferred: #277 and #1188 (see decisions). |
| [59 2024-08-05](https://github.com/bldrs-ai/Share/milestone/59), [63 Unclear](https://github.com/bldrs-ai/Share/milestone/63) | 11 and 22 open | #1233 (intermittent sample load error) and #759 (sample list as a JSON asset) beneath #757. The other members are out of scope. |
| [51](https://github.com/bldrs-ai/Share/milestone/51), [58](https://github.com/bldrs-ai/Share/milestone/58), [65](https://github.com/bldrs-ai/Share/milestone/65) (AP214 by link, multi-format) | 2, 2 and 5 | Format breadth, which has no story; unchanged. #885 (empty body) is the nearest open issue and is not parented. |

Milestone names, states and dates are untouched.

## Crosswalk

| Source | Owning issue | Decision |
|---|---|---|
| [roadmap §4.1 at `2154a8d`](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/design/roadmap.md#41-open) `open-100` (local) | #271, #2006 | **Extend** #271: it is the 2022 request for drag and drop and OS-level open. Drag and drop shipped; OS open did not. #2006 retained as shipped. |
| [roadmap §4.1 at `2154a8d`](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/design/roadmap.md#41-open) `open-100` (samples; "Open 100: Open sample model") | #757 | **Retain.** The roadmap has no row for samples; the old "Open 100" milestone puts them with the first open. |
| Failed-open reasons | #1962 | **Retain**, retitled as a story; the share of its text that is design stays in its original description. |
| `open-110` | #765, #1159 | **Retain** both closed stories. Their open bugs nest beneath them. |
| `open-120` | #244 | **Extend/Clarify.** The 2022 request is shipped but open; it stays open until verified. |
| `open-130` | #2263, new | **New.** No story existed; #1548 and #1682 are the closed bugs it supersedes as baseline. Drive's check is in `drive-recents-head-check.md`. |
| `open-300` | #2264, new | **New.** No story existed. #2230 is about *Bldrs* logins and stays with `identity-120`. |
| Format breadth | none | **Pending** an owner decision (below). |
| LFS reads and enabling | #277, #1188 | **Deferred** (below). |

## Applied changes

Titles:

| Issue | Before | After |
|---|---|---|
| #757 | Open 100 - Open sample model | open-100: Open a sample model |
| #271 | UI: Open local IFCs with 'open', double-click and drag-n-drop. | open-100: Open a model from my computer |
| #2006 | Open a model from inside a .zip (and .ifczip): half of rejected picks are archives | open-100: Open a model from inside a zip |
| #1962 | Say why a model failed to open, and show "no geometry" instead of "unusable" (conway#741/#740 consumer) | open-100: Say why a model didn't open |
| #765 | Open 100 - Open project from GH link | open-110: Open a model from a GitHub link |
| #1159 | Open 100: Open model on GitHub via open UI | open-110: Pick a model from my GitHub repositories |
| #244 | System: Integrate Google Drive | open-120: Open a model from Google Drive |

Labels: `story` added to #271, #244, #1962 and #2006. Bugs and other work nested under a story keep their own titles.

Created: epics #2258 (`open-100`), #2259 (`open-110`), #2260 (`open-120`), #2261 (`open-130`), #2262 (`open-300`), and stories #2263 (`open-130`) and #2264 (`open-300`), each a sub-issue of its epic. #2265 is `open-205`'s (see [open-205-triage.md](open-205-triage.md)).

Hierarchy, each added as a native sub-issue and none moved from another parent:

- #2258: #757, #271, #2006, #1962. #2259: #765, #1159. #2260: #244. #2261: #2263. #2262: #2264.
- #757: #761, #759, #1233. #271: #1906, #1955, #1892. #1962: #1087. #765: #1223. #1159: #1229, #1215, #666. #244: #1731, #2100. #2263: #1548, #1682.

Bodies: #271, #1962 and #244 were rewritten, each with its original text verbatim in a collapsed "Original description". The closed stories (#757, #765, #1159, #2006) kept theirs. No state, milestone, assignee or checkbox changed.

After the changes each epic's sub-issues are exactly the stories in the snapshot.

## Evidence

Pinned to `2154a8d`; test definitions read, no test run, no runtime walkthrough.

| Story | Specs | Form factors |
|---|---|---|
| Samples (#757) | [Samples.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/Components/Open/Samples.spec.ts), 9 tests, with two `describe.skip` blocks (the ones that load a sample) | Not under `describeMobileAndDesktop` |
| Local (#271) | [browseFileChooser.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/Components/Open/browseFileChooser.spec.ts), [noOpfsUpload.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/Components/Open/noOpfsUpload.spec.ts), [uploadNotInBrowser.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/Components/Open/uploadNotInBrowser.spec.ts) | Desktop and mobile |
| Archive (#2006) | [modelArchive.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/loader/modelArchive.spec.ts), [hostedArchive.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/loader/hostedArchive.spec.ts) | Desktop and mobile |
| GitHub (#765, #1159) | [Github.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/Components/Open/Github.spec.ts), 5 tests; the two that open a model (by link and through the dialog) are `test.skip`, so only the file-browser dropdown tests run | Not under `describeMobileAndDesktop` |
| Drive (#244) | [GoogleDriveConnect.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/Components/Connections/GoogleDriveConnect.spec.ts), 5 tests | Not under `describeMobileAndDesktop` |
| Recents, local (#2263) | [pruneLocalRecents.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/connections/pruneLocalRecents.spec.ts) | Desktop and mobile |

- "Not under `describeMobileAndDesktop`" means the spec has no `[mobile]` variant, as the [CLAUDE.md](../../AGENTS.md) rule for UI stories asks for. Whether the flows work on a phone is not established by this. Follow-ups were filed on 2026-11-24 under the owning stories: [#2331](https://github.com/bldrs-ai/Share/issues/2331) (Samples), [#2332](https://github.com/bldrs-ai/Share/issues/2332) (GitHub) and [#2333](https://github.com/bldrs-ai/Share/issues/2333) (Drive).
- A Drive recent that is gone is not detected: `checkFileAccess` and `FileUnreachableError` do not appear in `src/`. The message for a gone *local* upload does ([`src/OPFS/messages.js`](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/OPFS/messages.js)).
- Several Drive accounts: [GoogleDriveTab.test.jsx](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/Components/Connections/GoogleDriveTab.test.jsx) checks the "Add another Google account" button, but no E2E spec connects two accounts.
- The `googleDrive` flag is on and `githubAsSource` is off ([`src/FeatureFlags.js`](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/FeatureFlags.js)).

## Decisions left open

Each is recorded in the issue named; this list only points there.

- Whether format breadth becomes a story of `open-100`, and #885's fate ([#2258](https://github.com/bldrs-ai/Share/issues/2258)).
- Whether open-from-the-OS stays in #271 ([#2258](https://github.com/bldrs-ai/Share/issues/2258)).
- Whether LFS reads (#277) are done, and where enabling LFS (#1188) belongs ([#2259](https://github.com/bldrs-ai/Share/issues/2259)).
- Whether Drive's missing OPFS cache is intended (#2100, [#2260](https://github.com/bldrs-ai/Share/issues/2260)).
- Whether the Sources tab is the Google tab or its own ([#2262](https://github.com/bldrs-ai/Share/issues/2262)).

## Milestone hypotheses

None of these is instrumented yet; GA cannot see a failed open at all until [#1954](https://github.com/bldrs-ai/Share/issues/1954) lands. Measurement plans belong in bizdev, per the [rubric](ux-rubric.md#where-each-kind-of-work-lives).

| Epic | Hypothesis | Metric | Test | Estimate |
|---|---|---|---|---|
| `open-100`, `-110`, `-120` | MVP. Getting a model on screen is the first step of every journey the trickle depends on, so a failed or confusing open costs the return visit. | Share of new visits that reach a displayed model, by source. With #1954: failed opens, and a successful second open in the session. | No holdout; a regression on observed use, controlled for tier, source and route kind, labelled correlational. | Not instrumented. |
| #1962 (new open story under a 1xx epic) | A reason for a failed open lets a person fix the file or leave knowingly, rather than retry blindly. | Second open within the session after a `load_failed`. | Before and after on the same event, labelled correlational. | Not instrumented. |
| `open-130` | The 100 band, as a variation on the others. A dead recent is a failed open the person didn't cause. | Failed opens that start from Recents, as a share of opens from Recents. | Correlational. | Not instrumented. |
| `open-300` | 3xx (Pro): people with work and personal accounts are the multi-account user. | People with two or more connections who open from the second within 7 days. | Correlational; the cohort is self-selected. | Not instrumented. |

§6.0 is unchanged. Where #1962 and #2263 sit against the MVP bar is the roadmap owner's decision until there is an estimate.

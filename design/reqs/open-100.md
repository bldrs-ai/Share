# Open 100

**Epics:** [open-100: Open a local file or sample model · #2258](https://github.com/bldrs-ai/Share/issues/2258), [open-110: Open a model from GitHub · #2259](https://github.com/bldrs-ai/Share/issues/2259), [open-120: Open a model from Google Drive · #2260](https://github.com/bldrs-ai/Share/issues/2260), [open-130: Recents that tell you when a model is gone · #2261](https://github.com/bldrs-ai/Share/issues/2261), [open-300: Open from any account I've connected · #2262](https://github.com/bldrs-ai/Share/issues/2262) · **Scope snapshot: 2026-11-23**

## Motivation

Every session starts by getting a model onto the screen, and nothing else in Share matters if that fails. People's models are on their computer, in a GitHub repository or in Google Drive, and many are large or private. Share opens them in the browser without uploading the bytes; viewing a local or public model needs no sign-in. These five epics are the Open journey by source. They share one snapshot and one triage record because each has only one to four stories and they share the same tier, aliases and failure rules. The workspace around them is [open-200](open-200.md), in-app switching is [open-205](open-205.md), and viewing several models at once is [open-210](open-210.md).

The journey is **pick a source → pick a model → watch it load → if it can't open, learn why → find it again later**. A model that is gone, unreadable or not shared with you is said to be so; it never shows as a crash.

## UX stories

Each linked issue carries its epic's prefix and owns its tasks and acceptance. Closed stories are the shipped baseline.

| Epic | Story | User goal |
|---|---|---|
| `open-100` | [Open a sample model · #757](https://github.com/bldrs-ai/Share/issues/757) (closed) | Try Share on a sample, with no model of one's own. |
| `open-100` | [Open a model from my computer · #271](https://github.com/bldrs-ai/Share/issues/271) | Choose or drop a local file and see it, without uploading it. |
| `open-100` | [Open a model from inside a zip · #2006](https://github.com/bldrs-ai/Share/issues/2006) (closed) | Open a model that arrived in a `.zip` or `.ifczip`. |
| `open-100` | [Say why a model didn't open · #1962](https://github.com/bldrs-ai/Share/issues/1962) | Read a plain reason for a failed open, and tell an empty file from a Share failure. |
| `open-110` | [Open a model from a GitHub link · #765](https://github.com/bldrs-ai/Share/issues/765) (closed) | Paste a GitHub link and see the model, signed in or not. |
| `open-110` | [Pick a model from my GitHub repositories · #1159](https://github.com/bldrs-ai/Share/issues/1159) (closed) | Browse organisation, repository, branch and file, and open it. |
| `open-120` | [Open a model from Google Drive · #244](https://github.com/bldrs-ai/Share/issues/244) | Connect Drive, pick a file or open a link, with Drive's sharing deciding access. |
| `open-130` | [Open a recent model, and be told when it is gone · #2263](https://github.com/bldrs-ai/Share/issues/2263) | Reopen from Recents, and get a plain message when the file is gone. |
| `open-300` | [Open from any of my connected accounts · #2264](https://github.com/bldrs-ai/Share/issues/2264) | Connect two Drive accounts and open from either. |

Each epic's native sub-issues are exactly the stories listed for it.

## Not owned here

- **Format breadth** (IFC, STEP, glTF, OBJ, STL, splats, DICOM and others) has no story. The technical side is [adding-model-formats.md](../new/adding-model-formats.md); whether it becomes a story of `open-100` is an open decision on [#2258](https://github.com/bldrs-ai/Share/issues/2258).
- **`versions-100`** ([#57](https://github.com/bldrs-ai/Share/issues/57)) owns opening an exact revision and saving to GitHub. **`share-110`** ([#2205](https://github.com/bldrs-ai/Share/issues/2205)) owns saving to Drive. **`share-130`** owns why a shared version won't open.
- **`identity-t100`** ([#2202](https://github.com/bldrs-ai/Share/issues/2202)) owns connections, including reading private GitHub models through one.
- **`open-t100`** holds the technical work behind `open-130`.

**Milestone:** `open-100` to `open-120` are the shipped basic journey (1xx); `open-130` is a variation on them (roadmap §6.0); `open-300` is the 3xx band. The roadmap keeps them ✔ or 🟡 as before. The hypothesis and metric for each are in the [triage record](open-100-triage.md), with the aliases, inventory and milestone audit. Current tasks, progress and open decisions live in the epics and their stories. Revise and re-date this snapshot when the motivation or the story list changes; Git history keeps earlier versions.

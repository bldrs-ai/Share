# Notes 200

**Epics:** [notes-200: Exchange notes with other tools through BCF · #2280](https://github.com/bldrs-ai/Share/issues/2280), [notes-300: Keep notes on Google Drive · #2281](https://github.com/bldrs-ai/Share/issues/2281), [versions-300: See what changed between two versions · #2282](https://github.com/bldrs-ai/Share/issues/2282), [versions-310: Keep versions on Google Drive · #2283](https://github.com/bldrs-ai/Share/issues/2283) · **Scope snapshot: 2026-11-23**

## Motivation

[notes-100](notes-100.md) and [versions-100](versions-100.md) are the basic journeys. These four epics are what comes after, all post-MVP: notes that move to and from other BIM tools as BCF files, notes and versions kept on Google Drive instead of GitHub, and a view of what changed between two versions. Each answers a request that comes from teams whose review process already lives elsewhere.

The journeys are short. **Export a note to a BCF file, or import one**; **write notes that live in my Drive**; **keep a version's history with its file on Drive**; **pick two versions and see what changed**. The technical formats behind the first three are track `notes-t200` ([#2204](https://github.com/bldrs-ai/Share/issues/2204)).

## UX stories

Only `notes-200` has a formal story. The other three epics are placeholders until the work is picked up; their stories are pending.

| Epic | Story | User goal |
|---|---|---|
| `notes-200` | [Import and export BCF issues · #357](https://github.com/bldrs-ai/Share/issues/357) | Round-trip notes through BCF 2.1 files. |
| `notes-300` | none yet | Notes stored in Drive. |
| `versions-300` | none yet | See what changed between two versions (needs a structural IFC diff). |
| `versions-310` | none yet | Versions stored in Drive in a portable layout. |

The roadmap's §3.1 row for `notes-100` now links [#670](https://github.com/bldrs-ai/Share/issues/670) (its epic existed but wasn't linked), and `versions-100` already linked [#57](https://github.com/bldrs-ai/Share/issues/57).

## Not owned here

- **`notes-100`** and **`versions-100`** own the basic journeys; **`share-200`** ([#2144](https://github.com/bldrs-ai/Share/issues/2144)) owns publication and the later semantic stages, including round-tripping an *edited model* through another tool ([#2164](https://github.com/bldrs-ai/Share/issues/2164)).
- **`view-230`** owns placemarks and the tag-filtering UI.
- **Drive access** is `open-120` and `share-110`.

**Milestone:** all post-MVP (roadmap §8). The hypotheses are in the [triage record](notes-200-triage.md), with the inventory. Revise and re-date this snapshot when the motivation or a story list changes.

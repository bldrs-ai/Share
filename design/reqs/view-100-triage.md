# View 100 triage

**Reconciliation date:** 2026-11-23. **Evidence commit:** [`a709994`](https://github.com/bldrs-ai/Share/commit/a709994d761a29bad0554d4bc1df2b0a5a66777f). **Result:** eight epic issues created for the epics that had none, 16 stories placed (all existing issues), their bugs nested beneath them. `view-140` and `view-220` were left as they were. No runtime acceptance is claimed.

The [scope snapshot](view-100.md) has the motivation and the story list. This record keeps the evidence behind it. Tasks, progress and open decisions live in the epics and their stories. The [rubric](ux-rubric.md) sets the procedure.

## Epics, tier and aliases

The roadmap's §3.1 rows for `view-100`, `-110`, `-120`, `-130`, `-200`, `-210`, `-230` and `-300` linked no issue. Epics were created on 2026-11-23, labelled `epic` and `enhancement`: [#2270](https://github.com/bldrs-ai/Share/issues/2270) to [#2277](https://github.com/bldrs-ai/Share/issues/2277), in that order. `view-140` ([#1705](https://github.com/bldrs-ai/Share/issues/1705)) and `view-220` ([#1881](https://github.com/bldrs-ai/Share/issues/1881)) already had epics.

**Tier.** No code or band changed. `view-100` to `view-130` are the 1xx basic journey; the roadmap keeps `view-130` 🟡 for the public-launch gate (§6.0 item 1).

**Aliases.** The numbers were reshuffled in v0.5, and several were reused ([ID lineage](../roadmap.md#id-lineage)): `view-130` was Persistent visibility in v0.2–v0.4 and Performance since v0.5; `view-140` was Selection camera, now Scoped display controls; `view-220` was ETL and is now Common view operations; `view-230` was Placemarks at `view-180`, then `view-240`. Issue titles use an older scheme: "View 100 - …" for the first wave, and "View 200: …" for the second (selection camera, measurement, surface-aligned cut plane, persistent visibility). The "View 200" prefix on #1044, #1045, #1047 and #1250 belongs to that scheme, not to the current `view-200`.

## Inventory

Searched on 2026-11-23 with the GitHub search API, `repo:bldrs-ai/Share is:issue`. Title searches covered open and closed issues: `view-100` to `view-300`, `search-100` to `search-320`. Topic searches covered open issues only: `ETL`, `table view`, `CSV export`, `placemark`, `measure`, `explode`, `IDS`, `nav-cube`, `ViewCube`, `isolate`, `hide`, `cut plane`, `cutplane`, `camera`, `NavTree`, `properties`, `highlight`, `selection`, `large model`, `performance`, `public-launch`, `screenshot harness`, `minimap` and `section box`. #1705's and #1881's sub-issues were read directly. No result set was marked incomplete.

Neighbours found and left with their owners: engine and render performance (#1613, #1601, #2139, #2092, #2135, #1632, #1633, #2099; `view-t100`), the vyzn issues (#381, #389, #460, #461, #475, #527; vyzn milestone 66), #1569 and #1570 (STEP metadata verification, `view-t100`, on §6.0's MVP list), #2086 and #2077 (streaming selection; `open-205` and `view-t100`), #1824 and #1820 (picking and outline bugs; standalone), #827 and #619 (selection bugs; standalone).

## Milestones

Expanded through the milestone list. Members not named are out of scope and unchanged.

| Milestone | Placed |
|---|---|
| [20 View 100: Initial model load and view](https://github.com/bldrs-ai/Share/milestone/20) | #1031, #1106 and #1242 (stories). The other 12 members are closed work and bugs; #1218 is a test chore. |
| [26 Model centering and view reset](https://github.com/bldrs-ai/Share/milestone/26) | #1042 (story), #418 beneath it. |
| [27 Shareable camera position](https://github.com/bldrs-ai/Share/milestone/27) | #1043 (story), #1124 beneath it. |
| [30 Synchronized tree and viewport selection](https://github.com/bldrs-ai/Share/milestone/30) | #1046 (story), #1175 beneath it. |
| [32 Navigate the project using element hierarchy](https://github.com/bldrs-ai/Share/milestone/32) | #1048 (story). |
| [49 View 100: Cutplanes](https://github.com/bldrs-ai/Share/milestone/49) | #1031 is also a member. The closed cut-plane bugs are unchanged; the story is #1106 (milestone 20). |
| [28](https://github.com/bldrs-ai/Share/milestone/28), [29](https://github.com/bldrs-ai/Share/milestone/29), [31](https://github.com/bldrs-ai/Share/milestone/31) (View 200: selection camera, surface-aligned cut plane, distance measurement) | #1044, #1045, #1047, one story each. |
| [34 Notes 200: Anchor a note to an element](https://github.com/bldrs-ai/Share/milestone/34), [42 Research existing Placemark code](https://github.com/bldrs-ai/Share/milestone/42) | #892 (story), #928 to #932 and #985 beneath it. #988 and #1263 are closed; #599 and #942 are linked references. |
| [59 2024-08-05](https://github.com/bldrs-ai/Share/milestone/59), [63 Unclear](https://github.com/bldrs-ai/Share/milestone/63) | #1249 (beneath #1242), #1250 (story) and #163 (beneath #56). #883, #884 and #886, the empty "Story: View: …" stubs, are in 63 and stay unparented. |

Milestone names, states and dates are untouched.

## Crosswalk

| Source | Owning issue | Decision |
|---|---|---|
| Roadmap §4.2 `view-100` (3D, NavTree, Properties) | #1031, #1042, #1046, #1048, #1242 | **Retain** the five closed stories. |
| Roadmap `view-110` (cut planes; "surface-aligned cut UI #1045 is post-MVP polish") | #1106, #1045 | **Retain** #1106. **Extend** #1045, kept under `view-110` as the roadmap says. |
| Roadmap `view-120` | #1043 | **Retain.** |
| Roadmap `view-130` | none | **Pending.** #883 and #886 have empty bodies and no acceptance; they are listed as **Clarify**, not parented. |
| Roadmap `view-200` | #1250 | **Clarify.** The roadmap says the remaining slice is `view-140`'s `#d:` token (#1712, closed). |
| Roadmap `view-210` | #1044, #1047 | **Retain** as open stories. |
| Roadmap `view-230` | #892, #894 | **Retain** #892. #894 was named as a `view-230` dependency by `notes-100`'s snapshot and is now its child. |
| Roadmap `view-300` | #56, #163 | **Extend** #56 (a link to a 2021 doc) into a story; #163 beneath it. |
| `view-140`, `view-220` | #1705, #1881 | **Unchanged.** |

## Applied changes

Titles:

| Issue | Before | After |
|---|---|---|
| #1031 | View 100: Initial model load and view | view-100: Load a model and see it framed |
| #1042 | View 100 - Model centering and view reset | view-100: Center the model and reset the view |
| #1046 | View 100 - Synchronized View and NavTree | view-100: Keep the 3D view and the tree in sync |
| #1048 | View 100 - Navigate using element hierarchy | view-100: Navigate a model by its element hierarchy |
| #1242 | View 100: Access properties of the selected element | view-100: Read the properties of the selected element |
| #1106 | View 100 - Cutplanes | view-110: Cut a model with planes |
| #1045 | View 200: Surface-aligned cut plane UI control | view-110: Attach a cut plane to a surface |
| #1043 | View 100 - Shareable camera position | view-120: Share the camera position |
| #1250 | View 200: Implement persistent visibility control | view-200: Keep hidden elements hidden across sessions |
| #1044 | View 200: Selection-based camera control | view-210: Frame the camera on a selected element |
| #1047 | View 200: Distance measurement between elements | view-210: Measure the distance between two elements |
| #892 | Notes 200: Anchor a note to an element | view-230: Anchor a note to an element |
| #56 | View element subsets, with table view and ETL🥉 | view-300: View element subsets as a table |

#894 already had the `view-230:` prefix.

Bodies: #1045, #1044, #1047, #1250, #892 and #56 were rewritten, each with its original text verbatim in a collapsed "Original description". The closed stories kept theirs. Epic bodies for the eight new epics are within the epic budget.

Hierarchy, each added as a native sub-issue and none moved from another parent:

- #2270: #1031, #1042, #1046, #1048, #1242. #2271: #1106, #1045. #2272: #1043. #2274: #1250. #2275: #1044, #1047. #2276: #892, #894. #2277: #56.
- #1242: #1249. #1046: #1175. #1042: #418. #1106: #1458. #1043: #1124. #1250: #482. #892: #928, #929, #930, #931, #932, #985. #56: #163.

After the changes each epic's sub-issues are exactly the stories in the snapshot.

## Evidence

Pinned to `a709994`; test definitions read, no test run, no runtime walkthrough. A spec that "doesn't use `describeMobileAndDesktop`" has no `[mobile]` variant; that doesn't show the flow fails on a phone.

| Area | Specs | Form factors |
|---|---|---|
| Camera link | [permalinkCamera.spec.ts](https://github.com/bldrs-ai/Share/blob/a709994d761a29bad0554d4bc1df2b0a5a66777f/src/Components/Camera/permalinkCamera.spec.ts), liveCameraLink.spec.ts | Desktop and mobile |
| Camera sharing | [ShareableCamera.spec.ts](https://github.com/bldrs-ai/Share/blob/a709994d761a29bad0554d4bc1df2b0a5a66777f/src/Components/Share/ShareableCamera.spec.ts) | Not under `describeMobileAndDesktop` |
| Cut planes | [CutPlanePick.spec.ts](https://github.com/bldrs-ai/Share/blob/a709994d761a29bad0554d4bc1df2b0a5a66777f/src/Components/CutPlane/CutPlanePick.spec.ts), [liveViewLink.spec.ts](https://github.com/bldrs-ai/Share/blob/a709994d761a29bad0554d4bc1df2b0a5a66777f/src/Components/Share/liveViewLink.spec.ts) | Desktop and mobile |
| Tree and selection | [SynchronizedView.spec.ts](https://github.com/bldrs-ai/Share/blob/a709994d761a29bad0554d4bc1df2b0a5a66777f/src/Components/NavTree/SynchronizedView.spec.ts), [navTreePermalink.spec.ts](https://github.com/bldrs-ai/Share/blob/a709994d761a29bad0554d4bc1df2b0a5a66777f/src/Components/NavTree/navTreePermalink.spec.ts) | Not under `describeMobileAndDesktop` |
| Tree and selection | navTreeBodySelection, navTreeAtIndex, NavTree.cacheHit | Desktop and mobile |
| Properties | [Properties.spec.ts](https://github.com/bldrs-ai/Share/blob/a709994d761a29bad0554d4bc1df2b0a5a66777f/src/Components/Properties/Properties.spec.ts) | Not under `describeMobileAndDesktop` |
| Properties | PropertiesLayout, PropertiesNestedRefs, the cache-hit specs | Desktop and mobile |
| Hide and isolate | IfcIsolator.spec.ts, stepVisibility.spec.ts, visibilityHash.spec.ts | Desktop and mobile |
| Display | displayPermalink.spec.ts, shading.spec.ts, shareDisplay.spec.ts | Desktop and mobile |
| ViewCube | viewCube.spec.ts | Desktop and mobile |
| Placemarks | markerRebind.spec.ts, markerModelSwitch.spec.ts (the in-app switch); the Notes specs for placemarks | Notes specs: not under `describeMobileAndDesktop` |

The gaps worth a follow-up are the tree's synchronization with the scene (#1046), `Properties.spec.ts` (#1242) and the placemark flows in the Notes specs (#892). Follow-ups were filed on 2026-11-24 under the owning stories: [#2334](https://github.com/bldrs-ai/Share/issues/2334) (tree and scene sync), [#2335](https://github.com/bldrs-ai/Share/issues/2335) (properties), [#2336](https://github.com/bldrs-ai/Share/issues/2336) (camera sharing) and [#2337](https://github.com/bldrs-ai/Share/issues/2337) (placemarks, where two `MarkerSelection.spec.ts` tests are `test.skip`).

## Decisions left open

Each is recorded in the issue named; this list only points there.

- Whether `view-130` gets a formal story, and the fate of the empty stubs #883, #884 and #886 ([#2273](https://github.com/bldrs-ai/Share/issues/2273)).
- Who owns #1243, the private-model access message ([#2270](https://github.com/bldrs-ai/Share/issues/2270), with `share-130`).
- What is left of #1250 after #1712 ([#2274](https://github.com/bldrs-ai/Share/issues/2274)).

## Milestone hypotheses

None of these is instrumented yet; GA's load timings don't mean what their names say until [#1954](https://github.com/bldrs-ai/Share/issues/1954). Measurement plans belong in bizdev, per the [rubric](ux-rubric.md#where-each-kind-of-work-lives).

| Epic | Hypothesis | Metric | Test | Estimate |
|---|---|---|---|---|
| `view-100` to `view-120` | MVP. A person who selects, reads properties or shares a view has engaged beyond looking, and shared views are the one earned channel. | Share of model opens followed by a selection, a properties read or a view share; shared-link opens. | No holdout; a regression on observed use, labelled correlational. | Not instrumented. |
| `view-130` | MVP, as a gate: the launch can't ship if the viewer regresses on real models. | Load success and time to first interaction by model size. | The public-launch harness (screenshot and GLB diff), not an experiment. | Not instrumented. |
| #1045 (new open story under a 1xx epic) | A cut that lines up with a surface is used more than a free plane. | Cut plane sessions that attach to a surface. | Correlational. | Not instrumented. |
| `view-200` to `view-300` | Post-MVP (2xx and later): depth for people who already return. | Per feature: sessions that use it, by model size and tier. | A randomized holdout behind each flag is acceptable. | Not instrumented. |

§6.0 is unchanged.

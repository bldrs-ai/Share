# Normalized load-log format

Owner: loading UX (conway [#301](https://github.com/bldrs-ai/conway/issues/301) follow-up).
Status: living doc — v1 shipped with Share PR #1593 + conway PR #377 follow-ups.

One text rendition of a model load, shared across every surface that can
show it:

- the **conway CLI** (stderr; animated on a TTY, plain lines when piped),
- the **browser console** (mirrored line-for-line by `loader/loadProgress.js`),
- Share's **snackbar expando** (`AlertDialogAndSnackbar`, the main bottom-
  center alert — live during load, a toggle reveals the accumulated lines),
- Share's **post-load report dialog** (`LoadReportControl`, the "i" next to
  the "?", copy-to-clipboard).

### End-of-load grace period + hand-off animation

When a load settles, the snackbar doesn't vanish — it hands off to the "i"
report control with a short grace period, driven by the store's `loadResult`
(`{status, summaryLine}`, set by `loadProgress.js#endLoadProgress`):

- **Success** shows a terse `Loaded <name>` (just the outcome + model name —
  the timing/heap Total and diagnostics stay one expand, or the "i" report,
  away) with an **OK** action for ~5s (`GRACE_MS`), then the **whole snackbar
  collapses into an icon-sized circle just above the "i" control and fades
  out over ~1s** (`startDismissAnimation`) — so the eye follows the report to
  where it now lives. The animation runs *only* on this automatic dismiss.
- **Error** shows the failure summary (`Load failed: …`, red) with an OK
  action and **no timer and no animation** — it waits for an explicit OK,
  which clears it instantly.
- **Expanding during the grace period** cancels the auto-dismiss + its
  animation (the user is now reading); the snackbar stays until OK, and that
  OK dismiss is instant. Any manual dismiss is instant — animation is
  reserved for the unattended success case.

A user pasting any of these into a bug report produces the same text; Sentry
receives the same trail as breadcrumbs plus the final report string in the
`load` context.

Canonical implementation: conway `src/core/progress_log.ts`
(`LoadLogAccumulator` + formatters), consumed by the conway CLI renderer.
Share deep-imports the same module — `@bldrs-ai/conway/src/core/progress_log`
(via conway's `./src/*` export map → `compiled/src/core/progress_log.js`,
dependency-free, no wasm) — so the CLI and the browser render byte-identical
text. (It was an interim local copy until the 1.381.1195 pin shipped the
module.)

## The report, line by line

```
Share v1.0.1132, 214 MB heap before load          ← 1. host + memory condition
Conway v1.379.1190                                ← 2. engine identity
Model: Arty_Z7.stp — AP214, 38.1 MB, SolidWorks 2021 (SwSTEP 2.0)   ← 3. model line
Download: 2.145s, +40.001234 MB heap              ← 4. completed stage (no bar)
Parsing: 3.201s, +210.512000 MB heap
Geometry [0%........56%] 41.004s, +388.250000 MB heap   ← live OR failed-at-56% stage
Total: 46.310s, 214.000000 → 852.000000 MB heap   ← 5. separate before/after
Warnings & errors (12):                           ← 6. captured console diagnostics
CDT Exception (hemisphere: 0, svg: 2) … (×8)
No basis found for brep!
```

1. **Host line** — Share version + used-JS-heap before the load begins
   (Chrome exposes `performance.memory`; the note is omitted elsewhere).
   The CLI's equivalent is implicit (process start).
2. **Engine line** — `Conway v<semver>` from `getConwayVersion()`. The
   old "Conway Web-Ifc Shim" phrasing is retired (the web-ifc surface is a
   compat layer inside conway that is being deprecated).
3. **Model line** — everything the STEP **header** reveals, printed as soon
   as the header parses and *not* dependent on the full file parse:
   file name, schema (IFC4 / AP214), size, originating system
   (preprocessor). Non-STEP formats print the format-independent subset:
   name, format tag, size.
4. **Stage lines** — one per stage. A stage **ends when the next begins**
   (or when the load finishes), so a stage that received only its opening
   marker still owns the real elapsed gap until the next — this is what
   makes a synchronous engine call between two string markers attribute its
   full duration/heap to the right stage. Each stage owns *only its deltas*:
   wall-clock duration and signed heap growth.
   - A **completed** stage drops the bar: `Label: 1.234s, +N MB heap`.
   - A stage frozen **before reaching 100%** (a failed/aborted determinate
     stage) keeps its bar to show how far it got: `Geometry [0%..56%] …`.
   - A **live** stage always shows its bar — determinate `[0%..56%]`
     (16 dots ≡ 100%), indeterminate `[...]`.
5. **Total line** — *not* a sum of stages: a separate before/after
   observation of wall clock and heap (`start → end MB heap`). Stages can
   overlap, skip, or leave gaps; Total stays honest regardless.
6. **Warnings & errors** — the text of every `console.warn`/`console.error`
   emitted during the load (this captures conway's engine warnings + CDT
   exceptions, which route through the console), deduplicated with `(×N)`
   counts and capped, appended below Total so the report is self-contained.

**Precision** — seconds to millisecond precision (3 decimals), memory to
byte precision (6 decimals of MB), per the report's diagnostic purpose.

After the report, the engine's info/warn summary follows in the console
(unchanged): the statistics line (parse/geometry/total ms, geometry memory,
**products count**, **geometry-type breakdown** —
`IFCEXTRUDEDAREASOLID×3421 IFCFACETEDBREP×212 (+3 more)`) at info, and the
deduplicated parser warnings at warn (full table behind debug verbosity).

## Cascading by model type (the normalized form)

Every format gets the format-independent core; richer formats add layers:

| Layer | GLB / FBX / OBJ / … | IFC | STEP (AP203/214/242) |
|---|---|---|---|
| Host + engine + Total lines | ✓ | ✓ | ✓ |
| Model line | name, tag, size | + header fields | + header fields |
| Download stage (bytes, determinate) | ✓ | ✓ | ✓ |
| Parse stage | indeterminate (opaque three.js parse) | determinate (bytes) | determinate (bytes) |
| Geometry stage | — (part of parse) | determinate (products) | indeterminate heartbeat (thunk-tree walk) |
| Convert / fixup stages | as they occur | as they occur | as they occur |

Mechanics: engine phases arrive as structured `ProgressEvent`s
(`{phase, completed, total?, elapsedMs, memoryMb?}`); Share-side stages and
legacy string milestones ("Converting model format...") are normalized into
the same shape by `loadProgress.js`, which stamps missing wall-clock/heap
fields — that stamping is what makes the format-independent core available
for *any* loader without per-format work.

## Stage taxonomy

`download`, `headerParse` + `dataParse` (both render as **Parsing**),
`geometry`, `sceneBuild`, `serialize` (CLI write), `convert`, plus any
loader-specific string milestone (rendered as its own stage, trailing
`...` stripped). Stage transitions are inferred from the event stream — a
new label closes the previous stage — so surfaces never need explicit
begin/end plumbing.

## Non-goals / future

- Interior progress of single wasm calls (tessellation/CSG/weld) — the
  per-product tick bounds the blind spot to one product.
- AP214 determinate geometry (needs a flat walk over the thunk tree).
- Per-geometry-type max mesh sizes in the breakdown (counts shipped first).

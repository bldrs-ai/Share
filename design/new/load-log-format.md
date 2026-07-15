# Normalized load-log format

Owner: loading UX (conway [#301](https://github.com/bldrs-ai/conway/issues/301) follow-up).
Status: living doc — v1 shipped with Share PR #1593 + conway PR #377 follow-ups.

One text rendition of a model load, shared across every surface that can
show it:

- the **conway CLI** (stderr; animated on a TTY, plain lines when piped),
- the **browser console** (mirrored line-for-line by `loader/loadProgress.js`),
- Share's **status-bar expando** (`LoadStatusSlot`, live during load),
- Share's **post-load report dialog** (`LoadReportControl`, the "i" next to
  the "?", copy-to-clipboard).

A user pasting any of these into a bug report produces the same text; Sentry
receives the same trail as breadcrumbs plus the final report string in the
`load` context.

Canonical implementation: conway `src/core/progress_log.ts`
(`LoadLogAccumulator` + formatters), consumed by the conway CLI renderer.
Share currently carries an interim byte-identical copy in
`src/loader/loadLogFormat.js` — swap it for the conway deep import once the
pin includes it, then delete the copy (note in that file's header).

## The report, line by line

```
Share v1.0.1132, 214 MB heap before load          ← 1. host + memory condition
Conway v1.379.1190                                ← 2. engine identity
Model: Arty_Z7.stp — AP214, 38.1 MB, SolidWorks 2021 (SwSTEP 2.0)   ← 3. model line
Download [0%................100%] 2.1s, +40 MB heap    ← 4. stage lines…
Parsing [0%................100%] 3.2s, +210 MB heap
Geometry [0%........56%] 41.0s, +388 MB heap           ← (live/animated line)
Total: 46.3s, 214 → 852 MB heap                        ← 5. separate before/after
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
4. **Stage lines** — one per stage, frozen when the stage completes. Each
   stage owns *only its deltas*: its wall-clock duration and its heap
   growth (`+N MB heap`, signed). The ASCII bar grows dots with percent
   (`[0%........56%]`, 16 dots ≡ 100%) for determinate stages;
   indeterminate stages render `[...]`.
5. **Total line** — *not* a sum of stages: a separate before/after
   observation of wall clock and heap (`start → end MB heap`). Stages can
   overlap, skip, or leave gaps; Total stays honest regardless.

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

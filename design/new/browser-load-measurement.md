# Browser load measurement

Every preview and load number published for M3 so far comes out of a Node
harness nobody runs in production — `conway scripts/preview_timeline.mjs`,
`scripts/stream_corpus_sweep.mjs`. That is the whole premise of conway
[#544](https://github.com/bldrs-ai/conway/issues/544). **This is the browser
counterpart:** it drives a real model load through Share's normal path in
Chromium, records what a user would actually experience, and writes it as a
diffable JSON record.

| Piece | Path |
|---|---|
| Measurement library | [`src/tests/e2e/loadMeasure.ts`](../../src/tests/e2e/loadMeasure.ts) |
| In-page probe + model-URL resolution (no Playwright import) | [`src/tests/e2e/loadProbe.ts`](../../src/tests/e2e/loadProbe.ts) + `loadProbe.test.js` |
| Report-line parsers (no Playwright import) | [`src/tests/e2e/loadReport.ts`](../../src/tests/e2e/loadReport.ts) + `loadReport.test.js` |
| The spec that drives it | [`src/viewer/loadTiming.spec.ts`](../../src/viewer/loadTiming.spec.ts) |
| Output | `tools/measure/<label>-<formFactor>.json` (gitignored) |

Nothing here touches product code. Every in-page observable is read from
the Zustand store already exposed on `window.store` (playwright builds
only, `BaseRoutes.jsx`) or from the three.js scene reachable through it.


## Running it

```bash
# whole harness, both form factors, default fixture model
yarn test-flows src/viewer/loadTiming.spec.ts --workers=1

# desktop only, five iterations
BLDRS_MEASURE_ITERATIONS=5 yarn test-flows src/viewer/loadTiming.spec.ts \
  --workers=1 -g "\[desktop\].*cross-check"
```

`--workers=1` is not optional locally — see PLAYBOOK.md §"Playwright locally
needs `--workers=1`".

Everything is env-driven so the same spec scales to a machine that *has* a
big corpus model, with no code change:

| Variable | Default | Meaning |
|---|---|---|
| `BLDRS_MEASURE_MODEL` | the in-repo sculpture fixture | Share route (`/share/v/gh/…`) or absolute URL |
| `BLDRS_MEASURE_LABEL` | `sculpture` | output filename stem |
| `BLDRS_MEASURE_FEATURES` | *(none)* | comma-joined `?feature=` flags, e.g. `workers` |
| `BLDRS_MEASURE_ITERATIONS` | `1` | loads per run; summary is min/median/max |
| `BLDRS_MEASURE_CPU_THROTTLE` | `1` | CDP `Emulation.setCPUThrottlingRate` |
| `BLDRS_MEASURE_NET_MBPS` / `_NET_LATENCY_MS` | `0` / `0` | CDP `Network.emulateNetworkConditions` |
| `BLDRS_MEASURE_OUT` | `tools/measure` | output directory |

### What `BLDRS_MEASURE_MODEL` may be

The browser has to land on **Share**, not on the model bytes, so
`toViewerUrl` (`loadProbe.ts`) resolves three cases on structure rather
than on a guess:

| You pass | Recognized by | Chromium goes to |
|---|---|---|
| a route — `/share/v/gh/o/r/main/x.ifc` | not absolute (`new URL` throws) | it, against the dev server |
| an absolute **Share viewer** URL — `https://…/share/v/gh/…` | `/share/v/{p,new,gh,u,g}/` in its **pathname** | it, unchanged |
| an absolute **hosted model** URL — `https://host/PSB.ifc` | absolute, no viewer route in the path | `/share/v/u/<percent-encoded>` |

The wrap is percent-encoded (as `SearchBar` and `routes.spec.ts` do), which
is what keeps a signed URL's own `?…` inside the splat instead of colliding
with the `?feature=` query. Two consequences worth knowing: an external
model must carry its scheme (`host/x.ifc` reads as a route and 404s), and
the host must serve CORS headers the viewer can fetch through — the same
requirement any `/share/v/u/` load has.

`timings.documentUrl` in every sample records what was actually navigated
to, so a mis-resolution is visible in the record rather than only as a
timeout.

A route under `bldrs-ai/test-models` is served from
`src/tests/fixtures/github/**` by the playwright dev server. Anything else
is fetched for real — the fixture intercept is skipped automatically.


## Reading the output

The human-readable block is printed at the end of the run; the JSON record
(`schema: "bldrs.loadMeasure/1"`) is the diffable artifact. The numbers that
matter, and precisely what each one contains:

| Field | Anchor | Includes | Excludes |
|---|---|---|---|
| `timings.firstMeshMs` | navigation start | page boot, bundle, download, wasm init, parse | — |
| `derived.firstMeshSinceOpenMs` | the `Opening model` status line | **wasm init**, parse | page boot, download |
| `derived.firstMeshSinceParseStartMs` | the `Parsing` status line | parse only | wasm init, download |
| `derived.downloadMs` | model request start → response end | transfer | — |
| `timings.modelReadyMs` | navigation start | everything, through `data-model-ready` | — |
| `report.total.seconds` | conway's own clock | what the load report says | page boot |

**`firstMeshSinceOpenMs` is the conway #544 cross-check number.**
`ShareIfcLoader` emits `Opening model...` immediately before
`parseIfcWithConway`, which is the same point `preview_timeline.mjs` sets
its `t0` — so the two are directly comparable, with one asymmetry: the Node
script calls `api.Init()` *before* `t0`, while conway's wasm init is lazy
inside `parseIfcWithConway` and therefore lands **inside** the browser
window. Expect the browser figure to run long by the init cost.
`firstMeshSinceParseStartMs` is the tighter anchor (after init) but is
`null` whenever the parse was too short to publish a `Parsing` line of its
own.

### How "first mesh" is observed, and what it is not

An in-page probe, injected at document start, censuses the three.js scene
once per `requestAnimationFrame` and reports the first frame containing a
mesh that was **not** present when the scene first became reachable. The
baseline is the viewer's own furniture; anything new is model geometry —
whether it arrived through the parse-time preview channel
(`ON_PREVIEW_MESH` → `ProgressiveLoadSession.addPreviewMesh`), the durable
batch pump, or a one-shot end-of-load build. Being uuid-based rather than
name-based it needs no knowledge of which path produced the mesh, which is
the point: which path fires first *is* the M3 question.
`timings.baselineMeshCount` is recorded so a reader can confirm the census
happened before any model geometry landed.

It measures **scene-graph presence**, accurate to about one frame (~16 ms)
of the first frame that actually paints those pixels. Rejected
alternatives: canvas readback needs `preserveDrawingBuffer` (a product
change with a real per-frame cost); CDP screencast frames are throttled and
re-encoded, so their timestamps are worse than a frame; hooking
`ON_PREVIEW_MESH` directly is reachable only from inside product code and
would see preview meshes only, missing every non-deferring path.

Stage transitions come from a Zustand **subscription**, not from the frame
loop. `loadProgress.js` republishes `currentLoadLine` on stage close and on
a 100 ms tick, so a 74 ms `Parsing` stage is a single ~14 ms window that a
16 ms rAF sampler misses about half the time — observed on this box, not
theorized.

### The `Preview:` line

`report.preview` is `null` today and that is correct, not a failure. The
pinned conway (1.588.1550) *does* export `formatPreviewLine` /
`setPreviewStats` in `compiled/src/core/progress_log.js`; Share does not
call them yet, which is conway #544's Share-side arm. The field is present
and nullable so a run records "not reported" distinctly from "reported as
zero", and `loadReport.ts` already parses the line — proven by
`loadReport.test.js`, which generates its fixtures **from conway's own
formatter** rather than from hand-typed strings. The moment #544 lands,
`report.preview` and the `previewFirstMeshMs` summary metric start
populating with no change here.

`report.previewError` is the other half of that field: a `Preview:` line
that was **present and did not parse** is recorded there verbatim, and
`preview` stays null. conway's `formatPreviewLine` interpolates whatever
the caller hands it, so a JS caller with partial stats emits a
well-formed-looking line carrying `undefined` counters — folding that into
`preview: null` would claim no preview channel ran when one did. Absence is
`preview === null && previewError === null`; anything else is a bug to
chase upstream, and the printed summary says which it saw.

One precision note the cross-check depends on: conway renders seconds to
three decimals, so the `Preview:` line carries whole milliseconds and
nothing finer. Agreement below ~1 ms is not observable through the report
at all.


## CPU-bound or bandwidth-bound? (conway #541)

conway #541 measured PSB at 52.9 s → 159.1 s under `?feature=workers` and
nobody knew whether that regression was CPU- or bandwidth-bound. Three
signals are wired in, all of them cheap:

1. **`sample.cpu`** — a CDP `Performance.getMetrics` delta across the load.
   `processTimeMs` is whole-renderer-process CPU (dedicated-worker threads
   included); `threadTimeMs` is the main thread's share; `offMainThreadMs`
   is the difference, which is the half a worker-pool change moves.
   `processTimeOverWall` is `processTimeMs / cpu.loadWallMs`, near 1.0 when
   the renderer burned about a full core for the whole load. **All three are
   invalid in the CPU-throttled arm** — see the box below. `loadWallMs` runs
   to `isModelReady`, deliberately not to the end of `waitForModelReady`,
   whose fixed 1 s settle wait would pad the denominator by a shrinking
   fraction as runs get slower.
2. **CPU throttling A/B** — `BLDRS_MEASURE_CPU_THROTTLE=4`. If the load
   scales with the multiplier it is CPU-bound.
3. **Network throttling A/B** — `BLDRS_MEASURE_NET_MBPS`. Note this
   throttles *every* request in the page, the bundle and wasm included, so
   on a small model it mostly measures boot. It is the right knob only when
   the model dominates the byte count.

Measured on this sandbox (4 cores / 16 GB, 320 KB sculpture fixture,
5 iterations, medians). Compare **within** a table only: the unthrottled
column here and the one in the network table below come from different
sessions on a shared box, and their medians differ by more than some of the
effects being measured.

| | unthrottled | CPU ×4 | ratio |
|---|---|---|---|
| `report.total.seconds` | 1.9 | 5.5 | 2.9× |
| `derived.firstMeshSinceOpenMs` | 298 | 1064 | 3.6× |

Engine work scales near-linearly with CPU (3.6× for a 4× throttle) while
end-to-end load scales 2.9×, because download and fixed boot costs do not
throttle.

> **`cpu.*` cannot be read in the CPU-throttled arm.** An earlier revision
> of this doc quoted `cpu.processTimeMs` 2920 → 15420 (5.3×) and
> `processTimeOverWall` 0.5 → 1.0 as "the saturation crossing". That reading
> is wrong, and so is the metric. Throttling cannot manufacture CPU time:
> for fixed work under a 4× throttle the correct signature is CPU roughly
> flat and wall ~4×, i.e. the ratio *falling* to ~0.13. Chromium implements
> `Emulation.setCPUThrottlingRate` by suspending and re-scheduling the
> target from inside the renderer, and that overhead is inside the same
> process `ProcessTime` sums — so `processTimeMs`, `processTimeOverWall`
> **and `offMainThreadMs`** are all contaminated in this arm, the last of
> which is exactly what conway #541 wants. The defect is specific to CPU
> throttling: in the network arm below the ratio moves the way physics
> requires. The conclusion stands on `report.total.seconds` and
> `firstMeshSinceOpenMs`, which are engine-side clocks and unaffected.

The network arm separates cleanly from it. Re-measured after
`processTimeOverWall`'s denominator changed to `cpu.loadWallMs`, so every
number in this table is from one pair of runs (desktop, 3 iterations,
medians) and is **not** comparable to the CPU table above, which is an
earlier session on the same box:

| | unthrottled | 10 Mbps / 50 ms | ratio |
|---|---|---|---|
| `timings.firstMeshMs` (navigation-anchored) | 2988 | 16361 | 5.5× |
| `derived.firstMeshSinceOpenMs` (engine-anchored) | 410 | 448 | 1.1× |
| `report.total.seconds` | 1.3 | 1.4 | 1.1× |
| `cpu.loadWallMs` | 3805 | 17091 | 4.5× |
| `cpu.processTimeMs` | 3270 | 7010 | 2.1× |
| `cpu.processTimeOverWall` | 0.9 | 0.4 | — |

Stated precisely, because the CPU arm shows what happens when it is not:
wall grows 4.5×, CPU grows 2.1×, so the ratio *falls*. CPU is not flat —
a page alive four and a half times as long does more network-stack, compositor and
idle-render work — but it grows far slower than wall, which is what
"waiting, not computing" looks like. Contrast the CPU arm, where CPU rose
*faster* than wall on identical work; that is not a physical outcome, it is
the instrument.

That contrast is the whole reason the record carries both anchors:
bandwidth moves the navigation-anchored number by 5.5× and what the engine
actually does by 1.1×. On this 320 KB fixture nearly all of that is the
bundle and the wasm binary, not the model — CDP network emulation is
page-wide. At 1 Mbps the run does not finish inside a 120 s per-load
budget at all, which is worth knowing before choosing a profile.

### What it has actually been run against

| model | route taken | `firstMeshSinceOpenMs` | `report.total.seconds` |
|---|---|---|---|
| sculpture fixture, 320 KB | `/share/v/gh/…` (dev-server fixture) | 492 | 1.6 |
| MB-Khaya, 33 MB, hosted over HTTP | `/share/v/u/<percent-encoded>` | 1986 | 21.7 |

The second row is what proves the hosted-model path end to end: an absolute
`http://…/MB-Khaya.ifc` in `BLDRS_MEASURE_MODEL`, wrapped into
`/share/v/u/http%3A%2F%2F…`, 32,936,578 bytes seen by the byte counter, a
full six-stage report, and every cross-check field populated.

**Still not run against PSB (902 MB) or DOWA** — no corpus model of that
size has been through it, and the CPU-versus-bandwidth numbers below remain
a 320 KB fixture's.

Not built, deliberately: `performance.measureUserAgentSpecificMemory()`
needs cross-origin isolation, waits on a GC, and answers a memory question
rather than a CPU-versus-bandwidth one. Playwright has no `page.metrics()`
(that is Puppeteer); the CDP call above is its equivalent.


## Confounders to state whenever you quote a number

- **Stale `node_modules`.** `env.conwayInstalled` is read from
  `node_modules/@bldrs-ai/conway/package.json` — the version actually
  linked, not the pin in `package.json` — and sits next to `env.engineLine`,
  the engine's own claim. Disagreement between them means the run measured
  something other than what you think. Run `yarn install` first.
- **Model too small to preview.** The default fixture is 320 KB. Its first
  mesh lands *after* the parse ends, so it exercises the harness but says
  nothing about whether a parse-time preview helps. That question needs a
  deferring model.
- **Cold versus warm.** `sample.warm` is true from iteration 1 on, meaning
  the HTTP cache holds the bundle and the wasm binary. It does **not** mean
  a warm engine: each iteration is a full `page.goto`, so wasm init runs
  again every time, inside the `firstMeshSinceOpenMs` window. The summary
  reports min/median/max rather than a mean so one cold outlier cannot
  quietly move the number.
- **Scene triangle counts are coarse.** `scene.triangles` sums
  `geometry.index.count` across the scene, which on the default path is
  *buffer capacity*, not drawn triangles: `IncrementalBatchedBuilder`
  assembles the durable model into `THREE.BatchedMesh` batches preallocated
  at `INITIAL_INDICES = 1 << 19` and grown 2× in place
  (`src/viewer/ifc/incrementalBatchedBuilder.js`). The arithmetic is exact
  and worth keeping here, because this caveat has been misread once as an
  instancing artifact and once as not applying at all:

  | run | `scene.meshes` | `scene.triangles` | = | `healthSuffix` |
  |---|---|---|---|---|
  | sculpture (320 KB) | 1 | 174,762 | `⌊2^19/3⌋` | `triangles=3326` |
  | MB-Khaya (33 MB) | 2 | 524,287 | `⌊2^20/3⌋ + ⌊2^19/3⌋` | `triangles=251242` |

  Note this is **not** the `?feature=batchedMesh` path
  (`buildBatchedConwayModel`, `isActive: false`). That flag gates only the
  *end-of-load* builder at `ShareIfcLoader.js:445`; the incremental builder
  at `:395` runs whenever the preview session is on, which is the default.
  Use `report.total.healthSuffix` for the real figure.
- **Records written by CI are measurement garbage.** `tools/playwright.config.js`
  sets `fullyParallel: true` with `workers: 4`, and the spec's
  `describe.configure({mode: 'serial'})` only serializes *within* one
  describe — so `[desktop]` and `[mobile]` run concurrently with each other
  and with every other spec in the suite. A `test-flows` run therefore
  executes these model loads under 4-way contention on a shared runner, and
  the `tools/measure/*.json` it writes must never be quoted as a
  measurement. Only a deliberate local `--workers=1` run produces numbers.
  The specs are still worth running in CI: they are asserting that the
  harness observes what it claims to, which contention does not change.
- **`waitForModelReady`'s budget.** The shared helper defaults to 15 s;
  `measureLoad` passes its own `timeoutMs` (120 s default) because a big
  model or a throttled CPU blows straight through 15 s.

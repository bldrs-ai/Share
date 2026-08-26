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

A URL under `bldrs-ai/test-models` is served from
`src/tests/fixtures/github/**` by the playwright dev server. Any other URL
is fetched for real — point `BLDRS_MEASURE_MODEL` at a hosted big model and
the intercept is skipped automatically.


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
   `processTimeOverWall` at ~1.0 means the renderer burned a full core for
   the whole load; well below 1.0 means it spent its time waiting.
2. **CPU throttling A/B** — `BLDRS_MEASURE_CPU_THROTTLE=4`. If the load
   scales with the multiplier it is CPU-bound.
3. **Network throttling A/B** — `BLDRS_MEASURE_NET_MBPS`. Note this
   throttles *every* request in the page, the bundle and wasm included, so
   on a small model it mostly measures boot. It is the right knob only when
   the model dominates the byte count.

Measured on this sandbox (4 cores / 16 GB, 320 KB sculpture fixture,
5 iterations, medians):

| | unthrottled | CPU ×4 | ratio |
|---|---|---|---|
| `report.total.seconds` | 1.9 | 5.5 | 2.9× |
| `derived.firstMeshSinceOpenMs` | 298 | 1064 | 3.6× |
| `cpu.processTimeMs` | 2920 | 15420 | 5.3× |
| `cpu.processTimeOverWall` | 0.5 | 1.0 | — |

Engine work scales near-linearly with CPU (3.6× for a 4× throttle) while
end-to-end load scales 2.9×, because download and fixed boot costs do not
throttle. `processTimeOverWall` moving 0.5 → 1.0 is the saturation
crossing.

The network arm separates cleanly from it (3 iterations, medians):

| | unthrottled | 10 Mbps / 50 ms | ratio |
|---|---|---|---|
| `timings.firstMeshMs` (navigation-anchored) | 3906 | 19108 | 4.9× |
| `derived.firstMeshSinceOpenMs` (engine-anchored) | 298 | 689 | 2.3× |
| `report.total.seconds` | 1.9 | 2.4 | 1.3× |
| `cpu.processTimeOverWall` | 0.5 | 0.3 | — |

That contrast is the whole reason the record carries both anchors:
bandwidth moves the navigation-anchored number by 5× and what the engine
actually does by 1.3×. On this 320 KB fixture nearly all of that is the
bundle and the wasm binary, not the model — CDP network emulation is
page-wide. At 1 Mbps the run does not finish inside a 120 s per-load
budget at all, which is worth knowing before choosing a profile.

This is the methodology; **it has not been run against PSB or any other big
model, because none is in this sandbox.**

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
- **Scene triangle counts are coarse.** `scene.triangles` sums geometry
  attribute counts and over-counts a `BatchedMesh`'s preallocated buffers.
  Use `report.total.healthSuffix` for the real figure.
- **`waitForModelReady`'s budget.** The shared helper defaults to 15 s;
  `measureLoad` passes its own `timeoutMs` (120 s default) because a big
  model or a throttled CPU blows straight through 15 s.

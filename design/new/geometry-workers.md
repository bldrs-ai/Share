# Geometry workers: extraction off the main thread, sharded across cores

Share half of conway's M3 ([conway#394](https://github.com/bldrs-ai/conway/issues/394),
items 4 and 5). Cache-miss IFC geometry extraction moves into N Web Workers,
each holding its **own** conway instance and wasm heap and pumping a
**disjoint** subset of the model's products.

Behind `?feature=workers`, off by default.

## Why this axis and not the other one

There are two different things people mean by "parallel geometry", and
conflating them cost the epic a milestone.

**pthreads inside one wasm instance** — the C++ thread pool splitting work
*within* a product's tessellation, on a shared heap, driven by one serial JS
loop. Measured at zero-to-negative
([conway-geom#148](https://github.com/bldrs-ai/conway-geom/issues/148)): the
main thread's `Atomics.wait` degrades to a busy spin, `memory.grow` on a
shared heap stalls every thread and rebuilds all heap views, and the pool
oversubscribes against a busy main thread. That axis is dead.

**N instances over disjoint products** — this. Every one of those suspects is
structurally absent: separate linear memories mean no shared-heap grow stall,
and a worker may legally block. And the thing pthreads cannot touch at all is
the **serial JS driver**, which is ~75 % of the work and is exactly what N
drivers in N workers attack. Measured in node: PSB geometry **40.5 s → 7.4 s
at N=4**, with per-worker wasm peak falling 1283 → 364 MB, so it is a memory
lever as well as a time one.

## What had to land in the engine first

Two refusals in conway's `SetGeometryShard` made the pool unable to serve
Share specifically, and both were correct. Lifted in
[conway#538](https://github.com/bldrs-ai/conway/pull/538):

- **Residency-independent dispatch keys.** The key that decides which shard
  owns a product walks attribute records. On a windowed source — the only
  kind Share opens — whether a hop resolves depends on which chunks *that
  worker* holds, so two workers disagreed and a product was extracted twice
  or dropped. `computeDispatchKeys` pages the walk's own closure first.
- **`SetCoordinationFrame`.** `COORDINATE_TO_ORIGIN` anchors on the first
  geometry an instance captures, so N workers derived N frames. The frame is
  now an input: the main thread derives it once and hands the same matrix to
  every worker.

## Shape

The main thread keeps its own conway instance and does everything that is not
geometry — the parse, properties, the spatial tree, the preview channel, and
the coordination frame the workers are given. The workers only extract.

Each worker pays its own parse. That is the honest cost of this stage: the
end state hands workers transferable index columns so the parse is paid once
(M2's columns-from-birth index is what makes that possible), but nothing here
depends on it, and node measured the win *with* redundant parses.

### What crosses the boundary

The scene is built on the main thread by `incrementalBatchedBuilder`, which
resolves each placement's vertices through `GetGeometry`. Those live in the
worker's wasm heap and no other thread can read them, so each worker copies
every **new** geometry out once and transfers the buffers. Placements travel
as columns (`parents`, `geometryIds`, `transforms`, `colors`) rather than one
object per placement — PSB delivers ~23 000 of them, and structured-cloning
that many small objects is the kind of cost that eats what this buys.

`workerGeometryApi` re-serves the payloads main-side through the same
four-method surface the builder already calls, so the builder is untouched
and one code path assembles worker and non-worker loads alike.

**Two engines, and the split matters.** `geometryApi` resolves vertices;
`ifcAPI` is the model's own engine and is what property and spatial closures
bind to. They are the same object on every path but this one. Passing the
adapter where decoration was expected is how the first working version broke
(`Cannot read properties of undefined (reading 'getSpatialStructure')`).

### Reading one source from N workers

An OPFS `createSyncAccessHandle` is exclusive per file, which read as a
blocker for a pool. It isn't one: `makeBlobByteStore` reads through
`blob.slice().arrayBuffer()`, and a `File`/`Blob` is structured-cloneable, so
the main thread posts the same handle to every worker and each reads it
independently.

Off the OPFS path — a first load, before the model has ever been cached —
the resident bytes are wrapped in a `Blob` once. A Blob clones by reference,
so N workers share **one** copy rather than N. Without this the pool would
only ever engage on a cache hit, which is not the load a user waits for.

## The frame has to be derived before it is handed out

A deferred model's coordination frame is anchored on the **first geometry it
captures**, so until something is pumped `GetAppliedCoordinationMatrix`
returns **identity**. Handing that to the workers is not a no-op: a supplied
frame *suppresses* the one each worker would otherwise derive, and the frame
carries the Z-up → Y-up normalize — so every product renders 90° out.

The first working version of this shipped exactly that bug, and it survived
the whole test suite: vertices, triangles, instances and placement counts are
all **rotation-invariant**, so the E2E's "identical to a single-threaded load"
comparison passed on a model lying on its side. It took a human loading the
page to see it.

So the pool pumps **one product on the main thread first**, purely to derive
the frame, then reads it back. That is the same product a single-threaded load
anchors on, so the pooled frame doesn't merely agree across workers — it
*matches* the single-threaded one. The seed product's mesh is deliberately not
forwarded to the builder (the shard that owns it extracts it too), except on a
fallback, where the main-thread pump resumes past it and it would otherwise go
missing.

The frame is printed on the pool's summary line for the same reason: supplying
the wrong one leaves every other number on that line unchanged.

## Determinism, which is the part that bites

`incrementalBatchedBuilder` fixes the model-wide origin-recenter offset from
the **first placement it is handed**, rounded to whole metres. Across N
workers "first" would be whichever shard won the race — so a georeferenced
model would land on a different offset run to run, and every saved camera
against it would be wrong by the difference.

So the pool **queues every other shard's batches until shard 0 has spoken**,
and delivers shard 0's batch before releasing the queue. If shard 0 owns no
geometry at all, the queue is drained lowest-shard-first rather than in
arrival order. Both orderings are pinned by tests that fail when the gate is
removed.

This is the same class of bug as the coordination frame conway#538 fixed, one
layer up — worth stating plainly, because it will recur anywhere a "first
one wins" rule meets a pool.

## What the load report can and cannot see

Two things go stale under a pool, and both are fixed rather than documented
around:

- **Progress.** The report's Geometry line counts products, and the pool
  reports per batch, summing each shard's `extracted`/`remaining`. Reporting
  only on completion collapsed the line to `0.007s, +0.000000 MB heap` — the
  phase began and ended in one event — and left the reporter's 30-second
  stall watchdog with nothing to hear during the longest phase of a big load.
- **Memory.** The report's heap figures come from `performance.memory` on the
  **main thread**. Moving extraction into workers moves those allocations —
  JS heap and wasm heap both — somewhere that sample cannot see, so the
  Geometry line would show a large improvement while real process memory went
  *up* by N wasm heaps. Each worker reports its own, and the pool's summary
  line carries the sum (`wasmHeapMb=`). It is a separate line, not folded
  into the report's heap column: adding a main-thread sample to N worker
  samples would invent a number neither engine measured.

## Failure

A pool that fails before delivering anything falls back to the main-thread
pump, which is a complete recovery: nothing has been extracted on this thread
yet. A pool that fails *part-way* cannot silently fall back — the partial
scene came from payloads the pump cannot resolve, and appending pump batches
to the same builder would draw those products twice, from two engines. So the
loader calls `onGeometryReset` to drop the partial group first, and fails the
load loudly if no reset hook was supplied.

A pool that runs cleanly and delivers **nothing** is treated as a miss for
the same reason: it is indistinguishable on screen from a failure, and the
end-of-load builders would assemble an empty model from an empty `captured`.

## Flags

| flag | effect |
|---|---|
| `?feature=workers` | pool sized from `hardwareConcurrency − 2`, capped at 8 |
| `?feature=workers1` … `workers8` | pin the count — how N is compared against N=1 on one machine |

`workers1` is the move-to-worker baseline: same products, same order, one
thread over, no sharding at all. It is worth measuring separately, because
worker wasm init in a *browser* is unmeasured — in node it dominated small
models, so small-model regressions are plausible.

## Measured in a browser: 3x SLOWER, and why

The node spike said PSB 40.5 s → 7.4 s at N=4. The first real browser run says
the opposite, and the difference is the whole story.

**PSB (860.7 MB), Chrome, OPFS cache hit:**

| | baseline | `?feature=workers` (n=6) |
|---|---|---|
| Parsing | 15.8 s | **27.7 s** (+75 %) |
| Geometry | 24.6 s | **120.0 s** (4.9×) |
| Total | **52.9 s** | **159.1 s** (3.0×) |
| main-thread heap | 1 760 MB | 2 798 MB |
| worker wasm heap | — | **+1 938 MB** (6 × ~323 MB) |

**The partition is exact — this is not a duplication bug.** The pool reported
`placements=23454`, identical to the model's instance count, and
`geometries=20178`, matching conway's own PSB figure exactly. Nothing
duplicated, nothing dropped. The residency-independent dispatch key and the
affinity placement did precisely what they were measured to do.

**It loses because every worker parses the whole model first.** Six
concurrent 860 MB parses, and the main thread's own parse is the control that
proves the contention: 15.8 s → 27.7 s for work that did not change. The ~20 s
of nothing a user sees between parse and first geometry *is* the workers
parsing. It is currently serial on top of that — Share parses on the main
thread, then spawns the pool — so the N parses start after the main one
finishes instead of overlapping it.

The node spike ran 4 processes on an idle box over **resident in-memory
buffers**. Redundant parses were cheap there. In a browser, over OPFS, with
six wasm heaps competing for bandwidth, they are not.

## Worker startup is cheap — it is not what you are waiting for

Measured on `index.ifc` (18 KB, 7 products), so parse and extract are ~0 and
what remains IS the cost of standing workers up:

| N | last worker ready | conway `Init()` | model open | phase total |
|---|---|---|---|---|
| 1 | 780 ms | 82 ms | 82 ms | 0.75 s |
| 2 | 894 ms | ~100 ms | ~57 ms | 0.93 s |
| 4 | 1 329 ms | 77–122 ms | ~38 ms | 1.35 s |
| 6 | 1 751 ms | 131–221 ms | ~44 ms | 1.77 s |

Roughly **0.7 s for the first worker and ~0.2 s for each after** — about 2 s at
N=6, fixed, regardless of model size.

The decomposition matters more than the total. wasm `Init()` is **80–220 ms**
and the model open is **tens of ms**; nearly all of the rest is fetching and
compiling the worker bundle, which is 5.5 MB because it carries all of conway.
Trimming that bundle to the extraction path is the lever if startup ever needs
to be faster — not the wasm.

So the ~20 s gap a user sees between parse and first geometry on PSB is **not**
worker startup. It is the redundant parse, and startup is ~10 % of it at N=6.

## The ceiling, stated honestly

Even with a free shared index, PSB is bounded by Amdahl — parse is not
parallelised, geometry is. At the spike's 2.59× on extraction:

```
prep 6 + parse 15.8 + geometry 9.5 + assemble 5.3  ≈  37 s   vs   52.9 s
```

So **~30 %**, not the 5× the geometry-phase headline suggests. That is the
same observation conway#536 made when it noted the bottleneck had moved to
parse. Construct-from-columns is the lever that matters after this one.

## Parallelising the parse

The geometry pool alone caps at ~30 % because parse is serial. Sharding the
parse too is what makes the pipeline worth rebuilding, and it looks tractable:
a STEP parse is a scan over `#N=…;` records, so N workers can each tokenise a
disjoint byte range into partial index columns. conway already emits SoA
columns in 64 K-row segments (`ColumnarIndexSink`), which is a friendly shape
to concatenate.

The parts that need care, none of them blocking:

- **Local IDs are parse-order**, and parse order is byte order — so shard
  columns concatenate in address order provided each shard reports its record
  count so bases can be assigned at merge.
- **Inline entities** unfold into a tail range, and the express-ID lookup
  table is built from the merged columns. Both are post-merge steps.
- **Shard boundaries** must land between records, and a STEP string literal
  can contain `;` — so the boundary scan has to be tokenizer-aware rather
  than a naive search. This is the genuinely fiddly bit.

The payoff compounds with the geometry pool. PSB parse is 15.8 s for 860 MB
(~54 MB/s), which is CPU-bound tokenising, so even 3× gives:

```
prep 6 + parse 5.3 + geometry 9.5 + assemble 5.3  ≈  26 s   vs   52.9 s
```

roughly **2×**, against the geometry pool's ~30 % alone.

Note this does **not** remove the need for conway#541. A worker that parsed
one byte range holds a partial index, and extraction needs the whole model —
a product references records anywhere. So the shape is: parse shards → merge
columns once → hand the merged columns to every worker → extract shards. The
distribution step is conway#541 either way; parse sharding feeds it.

**The unblock is conway#541**: an `IfcAPI` entry that opens from a prebuilt
index. The serialisation half already exists (M4a's `index_sidecar.ts`, whose
functions are exported from conway's root barrel); nothing on the public open
surface consumes one. This is what #394 assumed from the start — *"workers can
be handed transferable index columns and pull by localID"* — and what M2's
columns-from-birth index was supposed to enable.

Until that lands the flag stays **off**, and the summary line reports
`wasmHeapMb=` so the cost is visible rather than hidden from
`performance.memory`, which only samples the main thread.

## Known workaround to remove

conway's `isWebPlatform()` checks for `window` or `process.env.PLATFORM`, and
a Worker has neither, so it loads the Node wasm and `Init()` dies. The worker
declares the platform itself until
[conway#540](https://github.com/bldrs-ai/conway/issues/540) lands. No build
define fixes this — the guard is `typeof process !== 'undefined'`, which no
bundler `define` supplies.

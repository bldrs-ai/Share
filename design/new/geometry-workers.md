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

## What is measured, and what is not

Measured: node, 4 cores, PSB 40.5 s → 7.4 s at N=4; MB-Khaya 1.76×; D3D
2.34×. E2E on `index.ifc` confirms the pool engages in a real browser at N=2
and assembles byte-identical build stats (vertices, triangles, instances) to
a single-threaded load, on desktop and mobile.

**Not** measured: browser wall-clock on a large model. `index.ifc` has seven
products — it proves the machinery, not the speedup. That number comes from
the smoke instance on PSB, and it is the one that decides whether this flag
ever goes default-on.

## Known workaround to remove

conway's `isWebPlatform()` checks for `window` or `process.env.PLATFORM`, and
a Worker has neither, so it loads the Node wasm and `Init()` dies. The worker
declares the platform itself until
[conway#540](https://github.com/bldrs-ai/conway/issues/540) lands. No build
define fixes this — the guard is `typeof process !== 'undefined'`, which no
bundler `define` supplies.

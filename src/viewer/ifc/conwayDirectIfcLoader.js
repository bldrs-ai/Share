// Conway-direct IFC parse path. Slice 5b of Phase 5 in
// design/new/viewer-replacement.md.
//
// Replaces wit-three's `IFCLoader.parse(buffer)` on the cache-miss
// path. The old flow used wit-three to drive Conway under the hood
// (wit-three's IFCParser called `ifcAPI.OpenModel` + `StreamAllMeshes`
// internally), then we threw away its assembled geometry and rebuilt
// via the Conway-direct assembler in `installConwayDirectGeometry`.
//
// Now we call Conway directly and build the model from scratch — no
// wit-three IFCParser, no discarded geometry. The wit-three
// `ifcManager` itself is still around (we still go through
// `viewer.IFC` for `addIfcModel` and `context` access), but its
// IFCLoader.parse is bypassed entirely. Slice 5c will drop the
// `ifcManager` too.
//
// Surface:
//   - `parseIfcWithConway(buffer, ifcAPI, settings)` →
//     `{modelID, captured, recapture}`
//     OpenModel + StreamAllMeshes; one async-shaped sync call (the
//     wrap is for symmetry with future move-to-worker paths).
//     `captured` is the retained FlatMesh stream and is EMPTY on the
//     streaming path (see `parseIfcWithConway`'s retention note);
//     `recapture()` is the whole-model accessor degraded readers use.
//   - `decorateConwayDirectIfcModel(ifcModel, ifcAPI, modelID, opts)`
//     Post-build decoration: BVH, IfcInstanceMap, capability flips,
//     subset method, property + spatial method closures. Runs on a
//     fresh Conway-built Mesh; signature matches the post-wit-three-
//     parse path the now-removed `installConwayDirectGeometry`
//     followed.
//
// Property-method closures attached on the model:
//   - `model.getItemProperties(expressID, recursive = false)`
//   - `model.getPropertySets(expressID, recursive = false)`
//   - `model.getSpatialStructure(_modelID, withProperties = false)`
//   - `model.getIfcType(eltType)` — identity. Matches the cache-hit
//     closure shape (`Loader.js#convertToShareModel`). SearchIndex
//     reaches this via `Ifc.getType(model, elt)` →
//     `model.properties.getIfcType(elt.type)`, and Conway's
//     `properties.getSpatialStructure` already returns nodes with
//     `.type` set to the IFC string (e.g. `'IFCWALL'`), so passing it
//     through unchanged is the right behaviour. (The wit-three pre-5b
//     path expected a numeric type code here because wit-three's
//     spatial-tree nodes carried `.type` as a number; that shape
//     vanished with Slice 5b.)
//
// All four ignore the modelID arg (when consumers pass one) and use
// the model's own bound modelID. Mirrors the cache-hit closure
// pattern in `Loader.js#convertToShareModel` so call-sites can
// dispatch on `typeof model.X === 'function'` without branching on
// the load backend.

import {isFeatureEnabled} from '../../FeatureFlags'
import {reportEngineVersion} from '../../loader/loadProgress'
import {makeBlobByteStore} from '../../loader/opfsSourceByteStore'
import debug, {WARN} from '../../utils/debug'
import {attachInstanceMapSubsets} from '../three/elementSubsets'
import {instanceMapFromGeometry} from './IfcInstanceMap'


/**
 * Parse an IFC buffer directly via Conway's IfcAPI. Returns the
 * Conway modelID + the FlatMesh stream that `buildConwayIfcModel`
 * consumes. Pure parse — no decoration, no Three.js construction.
 *
 * Conway's `OpenModel` is sync and returns -1 on failure; we throw
 * so the caller's outer try/catch surfaces the failure to the user.
 * `StreamAllMeshes` is also sync and invokes its callback once per
 * FlatMesh during the call — no async work to await.
 *
 * **Init dance:** pre-Slice-5b wit-three's `IFCLoader.parse` lazily
 * initialised Conway's wasm module on first call
 * (`if (this.state.api.wasmModule === undefined) await this.state.api.Init()`).
 * Slice 5b dropped that call path, so we re-do the lazy Init here —
 * without it `OpenModel` returns -1 on the very first cache-miss
 * load of any session. Detected by `ifcAPI.wasmModule === undefined`
 * (the same probe wit-three used).
 *
 * Settings default to the same shape wit-three's `applyWebIfcConfig`
 * was setting at the call site (origin-coordinating + boolean-faster).
 *
 * @param {ArrayBuffer|Uint8Array} buffer raw IFC bytes
 * @param {object} ifcAPI Conway-compatible IfcAPI (reach via
 *   `viewer.IFC.loader.ifcManager.ifcAPI`)
 * @param {object} [settings] OpenModel settings — defaults to
 *   `{COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true}` to match
 *   the wit-three baseline.
 * @param {Function} [onProgress] receives conway's structured
 *   ProgressEvents ({phase, completed, total?, unit, elapsedMs}) during
 *   the parse — a conway `Loadersettings.ON_PROGRESS` extension (#301);
 *   silently ignored by engines that predate it (real web-ifc, old pins).
 * @param {Function} [onMeshBatch] demand/tiled slice A: receives
 *   `(flatMeshes, modelID)` for each extracted batch as it lands (only
 *   on the `demandGeometry` deferred path) so callers can render
 *   progressively. Passing it makes the caller the OWNER of the stream:
 *   `captured` then stays empty and degraded readers must go through
 *   `recapture()` — see the retention note in the body (conway#638).
 * @param {Function} [onPreviewMesh] demand/tiled slice A2: receives
 *   conway PreviewMeshPayloads WHILE THE PARSE RUNS (self-contained
 *   copied geometry, preview quality — openings/materials can be
 *   missing; replaced wholesale by the durable batches). Only on the
 *   `demandGeometry` deferred path with engines that support
 *   ON_PREVIEW_MESH; silently ignored otherwise.
 * @return {Promise<{modelID: number, captured: Array,
 *   recapture: Function}>}
 */
export async function parseIfcWithConway(
  buffer, ifcAPI, settings = undefined, onProgress = undefined, onMeshBatch = undefined, onPreviewMesh = undefined) {
  if (!ifcAPI || typeof ifcAPI.OpenModel !== 'function') {
    throw new Error('parseIfcWithConway: ifcAPI.OpenModel is unavailable')
  }
  if (typeof ifcAPI.StreamAllMeshes !== 'function') {
    throw new Error('parseIfcWithConway: ifcAPI.StreamAllMeshes is unavailable')
  }
  // Lazy wasm init — see the `Init dance` note above.
  if (ifcAPI.wasmModule === undefined && typeof ifcAPI.Init === 'function') {
    // eslint-disable-next-line new-cap
    await ifcAPI.Init()
  }
  applyEngineLogLevel(ifcAPI)
  // Engine identity line for the load report (log line 2) — e.g.
  // "Conway v1.379.1190". Feature-detected; real web-ifc lacks it.
  if (typeof ifcAPI.getConwayVersion === 'function') {
    reportEngineVersion(ifcAPI.getConwayVersion())
  }
  const store = isBlobSource(buffer) &&
      !isFeatureEnabled('disableStreamOpen') &&
      typeof ifcAPI.OpenModelStream === 'function' ?
    makeBlobByteStore(buffer) :
    null
  let data = store === null ?
    (buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)) :
    null
  let openSettings = settings ?? {COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true}
  if (onProgress) {
    // ON_MODEL_INFO (conway extension) arrives once, right after the header
    // parses — forwarded through the same onProgress pipe as a
    // {modelInfo} envelope so callers need only one callback channel.
    openSettings = {
      ...openSettings,
      ON_PROGRESS: onProgress,
      ON_MODEL_INFO: (info) => onProgress({modelInfo: info}),
    }
  }
  // Demand/tiled rendering slice A (`demandGeometry` flag, #1613):
  // deferred open + batch pump. The open returns in parse time; meshes
  // then stream in file-order batches through `onMeshBatch` (accumulating
  // into `captured` only where nothing else takes delivery — see the
  // retention note below),
  // yielding to the event loop between batches so the scene can render
  // progressively. Feature-detected; engines without the pump fall
  // through to the classic selection below.
  if (isFeatureEnabled('demandGeometry') &&
      !isFeatureEnabled('disableStreamOpen') &&
      (typeof ifcAPI.OpenModelStreamed === 'function' ||
        typeof ifcAPI.OpenModelStream === 'function') &&
      (typeof ifcAPI.ExtractGeometryBatch === 'function' ||
        typeof ifcAPI.ExtractGeometryBatchAsync === 'function')) {
    const deferSettings = {
      ...openSettings,
      DEFER_GEOMETRY: true,
      GEOMETRY_BUDGET_MB: GEOMETRY_BUDGET_MB,
      // conway#638 / conway#657: declare that THIS loader owns delivery of
      // the pumped stream, so conway keeps no reference to it. A deferred
      // open builds each PlacedGeometry once and files that same object
      // into three pointer spines — conway's per-entity `meshMap`, its
      // `vectorFlatMesh`, and whatever the embedder keeps — and dropping
      // fewer than all three frees only the ~4.4 MB of one spine's
      // pointers, because the other holders keep the 475 MB graph alive.
      // This is the Share half of that; conway's is the flag's other end.
      //
      // Live on this pin (conway#657 landed at 1.1578.666-g39d59784):
      // conway now honours `STREAMING_CONSUMER` and keeps no reference to
      // the pumped stream, so the no-retention contract above is in effect
      // with no further change needed here.
      STREAMING_CONSUMER: true,
    }
    if (onPreviewMesh) {
      // Slice A2 (parse-time preview channel): conway emits preview
      // payloads between the parse's cooperative yields. Passing the
      // callback to an engine without the channel is harmless (unknown
      // settings are ignored), so no feature detection is needed here.
      deferSettings.ON_PREVIEW_MESH = onPreviewMesh
    }
    let modelID
    let openData = data
    // Did the open land on a WINDOWED source — bytes paged on demand out of
    // an OPFS/Blob store — rather than a resident buffer? Load-bearing for
    // the retention decision below, and knowable only here: conway exposes
    // `sourceIsExternal` on the proxy but not through the `IfcApi` shim
    // Share holds, and Share's `OpenModelStream(store, …)` is the only way
    // this loader produces a windowed model. Nothing later flips it — the
    // one call that would (`spillModelSource`) runs from the GLB writer's
    // `finally`, long after `parse` has returned.
    let windowedSource = false
    if (store !== null) {
      // eslint-disable-next-line new-cap
      modelID = await ifcAPI.OpenModelStream(store, deferSettings)
      windowedSource = typeof modelID === 'number' && modelID >= 0
      if (!windowedSource) {
        // IFC-only store path: STEP / failed sniff falls back to a
        // buffered streamed open (conway#510 contract).
        openData = await bytesFromSource(buffer)
        // eslint-disable-next-line new-cap
        modelID = await ifcAPI.OpenModelStreamed(openData, deferSettings)
      }
    } else {
      // eslint-disable-next-line new-cap
      modelID = await ifcAPI.OpenModelStreamed(openData, deferSettings)
    }
    if (typeof modelID !== 'number' || modelID < 0) {
      throw new Error(`parseIfcWithConway: OpenModel returned ${modelID}`)
    }
    const captured = []
    // Retention decision (conway#638). `captured` used to accumulate every
    // pumped FlatMesh unconditionally, and on the streaming path that array
    // is dead weight: `onMeshBatch` has already assembled each batch into
    // the durable BatchedMesh by the time the next one lands, and the only
    // remaining readers are ShareIfcLoader's DEGRADED end-of-load builds.
    // Holding one of the three pointer spines over a 475 MB graph against
    // the chance of a fallback is what this stops.
    //
    // Two states must keep the contents, and both are genuine:
    //
    //   1. No `onMeshBatch` — then `captured` IS the delivery, not a copy
    //      of it. Nothing else ever sees the stream.
    //   2. A WINDOWED deferred source. The replacement for retention is
    //      re-extraction at the moment of failure (`recapture` below), and
    //      re-extraction is `StreamAllMeshes`, which on a deferred model
    //      drains through the SYNCHRONOUS `ExtractGeometryBatch` — and that
    //      throws outright on a windowed source ("ExtractGeometryBatch is
    //      synchronous and cannot page a windowed source", pinned engine
    //      `compiled/src/compat/web-ifc/ifc_api_proxy_ifc.js:1527`, reached
    //      from `streamAllMeshes`' deferred drain loop at `:2771`).
    //      conway#657 does
    //      not change that: its re-walk (`recaptureWholeModel_`) hangs off
    //      the same drain, and there is no async whole-model entry point.
    //      `ExtractGeometryBatchAsync` cannot substitute — after a full
    //      drain its cursor is exhausted and there is no public rewind.
    //      So on a windowed open there is nothing to re-extract WITH, and
    //      dropping here would turn a rare degraded build into a blank
    //      screen. Retention stays until conway grows an async re-read.
    //
    // Note the asymmetry that leaves: a GitHub/OPFS-backed load takes the
    // windowed open by default (`Loader.js` hands `parse` the File itself),
    // so today this frees the stream on buffered opens only. The flag above
    // is still declared on both, which is correct — declaring it changes
    // what CONWAY retains, and `captured` is Share's own spine.
    const retainCaptured = onMeshBatch === undefined || windowedSource
    // Batch-pump accounting for the load log. Whether the pump actually
    // produced anything is the difference between a model that streams
    // onto the screen and one that shows nothing until the end-of-load
    // build, and until now the log said nothing either way — a blank
    // 9-second parse and a healthy streaming parse looked identical.
    //
    // Conway's deferred open only emits headerParse/dataParse; the
    // pump never starts a geometry phase. Report one here so the load
    // log splits Parsing from Geometry (same labels as a classic
    // extractIFCGeometryData open). elapsedMs omitted: the reporter
    // stamps wall-clock so we don't fight Conway's parse-relative clock.
    let pumpedBatches = 0
    // Counted rather than derived from `captured.length`, which is 0 on the
    // streaming path. This is the number the permanent boundary log reports
    // and the number the empty-pump sentinel tests, so it has to track the
    // meshes the pump actually delivered whether or not they were kept.
    let pumpedMeshes = 0
    let geometryTotal
    let geometryDone = 0
    const reportGeometry = (completed, total) => {
      if (typeof onProgress !== 'function') {
        return
      }
      onProgress({
        phase: 'geometry',
        completed,
        total,
        unit: 'products',
      })
    }
    for (;;) {
      const batch = []
      let extracted
      let remaining
      if (typeof ifcAPI.ExtractGeometryBatchAsync === 'function') {
        // Store-backed extract pages each product's #ref closure from
        // OPFS before extracting it. A 64-product batch serialises
        // that I/O and holds first pixels until ~halfway through
        // Geometry; 8 keeps file-order streaming and still amortises
        // the per-batch scene update.
        // eslint-disable-next-line new-cap
        const pumped = await ifcAPI.ExtractGeometryBatchAsync(
          modelID, ASYNC_DEMAND_EXTRACT_BATCH_SIZE, (flatMesh) => batch.push(flatMesh))
        extracted = pumped.extracted
        remaining = pumped.remaining
      } else {
        // eslint-disable-next-line new-cap
        const pumped = ifcAPI.ExtractGeometryBatch(
          modelID, DEMAND_EXTRACT_BATCH_SIZE, (flatMesh) => batch.push(flatMesh))
        extracted = pumped.extracted
        remaining = pumped.remaining
      }
      if (geometryTotal === undefined && (extracted > 0 || remaining > 0)) {
        geometryTotal = extracted + remaining
        reportGeometry(0, geometryTotal)
      }
      geometryDone += extracted
      if (geometryTotal !== undefined) {
        reportGeometry(geometryDone, geometryTotal)
      }
      if (batch.length > 0) {
        if (retainCaptured) {
          captured.push(...batch)
        }
        pumpedMeshes += batch.length
        pumpedBatches++
        if (onMeshBatch) {
          onMeshBatch(batch, modelID)
        }
        // `batch` itself goes out of scope on the next iteration, so on the
        // streaming path the last reference to this batch's FlatMeshes is
        // whatever `onMeshBatch` chose to keep — which for the incremental
        // builder is nothing (it copies every payload at delivery, the
        // Share#1640 invariant).
      }
      if (remaining === 0 && extracted === 0) {
        break
      }
      // Yield so the renderer paints between batches.
      await yieldToEventLoop()
    }
    // Permanent boundary log, like `[conwayDirect] parsed` in
    // ShareIfcLoader: whether the pump produced batches is the
    // difference between a load that streams onto the screen and one
    // that shows nothing until the end-of-load build, and the two are
    // indistinguishable without this line (Share#1744). console.info,
    // not debug() — debug() no-ops unless the level is raised.
    // eslint-disable-next-line no-console
    console.info(
      `[conwayDirect] demand pump: batches=${pumpedBatches} ` +
      `meshes=${pumpedMeshes} onMeshBatch=${onMeshBatch ? 'yes' : 'no'} ` +
      `onPreviewMesh=${onPreviewMesh ? 'yes' : 'no'} ` +
      `retained=${retainCaptured ? 'yes' : 'no'}`)
    if (pumpedMeshes === 0) {
      // Nothing pumped: conway fell back to a classic fully-extracted
      // open internally, so StreamAllMeshes below captures the whole
      // model in one go and NOTHING renders until the end-of-load build.
      // That is the blank-screen-then-pop behavior, and it is silent
      // without this line.
      console.warn(
        '[conwayDirect] demand pump produced no batches; ' +
        'falling back to one-shot StreamAllMeshes — no progressive render')
      // The pump is a no-op whenever conway did not actually open the model
      // deferred — it returns `{extracted: 0, remaining: 0}` on a
      // fully-extracted model — which happens on any streamed-parse failure
      // that fell back internally to a classic open. The model is fine, it
      // just has nothing to pump. Serve the one-shot capture instead of
      // returning an empty scene.
      //
      // NOT a STEP-vs-IFC split, though it used to be described as one:
      // conway routes AP214/AP203/AP242 with DEFER_GEOMETRY through
      // `IfcApiProxyAP214.createDeferred`
      // (`ifc_api_model_passthrough_factory.ts`), pinned engine-side by
      // `ap214_streamed_open.test.ts`, so STEP pumps like IFC does.
      //
      // Retention is unconditional here regardless of `retainCaptured`:
      // this branch means the streaming delivery produced nothing, so
      // `captured` is once again the only delivery.
      //
      // Where that leaves `StreamAllMeshes`, stated precisely because the
      // obvious shorthand is wrong. When conway really did fall back to a
      // classic open, the model is non-deferred and this takes conway's
      // classic scene walk over live natives — which works on a windowed
      // source where `recapture` below could not, because it never touches
      // the deferred drain. But `pumpedMeshes === 0` does NOT imply
      // non-deferred: the pump loop exits on `remaining === 0 &&
      // extracted === 0` whatever the reason, so a genuinely DEFERRED model
      // with nothing to extract (a properties-only IFC, or one whose every
      // product failed geometry) lands here too. On a windowed source that
      // model's `StreamAllMeshes` takes the deferred branch and throws
      // "cannot page a windowed source" out of the load. That is a
      // PRE-EXISTING defect, not one this change introduces — the sentinel
      // it replaced (`captured.length === 0`) selected exactly the same
      // models and called exactly the same method — and it is tracked
      // separately rather than fixed here.
      //
      // Nor is there a whole-model route around it. The three entry points
      // that do NOT throw on a windowed deferred model are all worse:
      // `loadAllGeometry` and `streamAllMeshesWithTypes` have no deferred
      // branch at all and seed coordination from `model[5]`, which a
      // deferred open never writes, so every instance lands in an identity
      // frame — silently mis-framed geometry, worse than a refusal; and
      // `getFlatMesh` is per-entity and would need an ID enumeration this
      // loader does not have. conway#657 routes the first and third through
      // `streamAllMeshes`, and this pin carries that fix, so they now refuse
      // properly instead of silently mis-framing.
      //
      // No onMeshBatch here: extraction is already complete, so a
      // preview would just double the geometry conversion right before
      // the final build renders the same thing.
      // eslint-disable-next-line new-cap
      ifcAPI.StreamAllMeshes(modelID, (flatMesh) => {
        captured.push(flatMesh)
      })
      return {modelID, captured, recapture: () => captured}
    }
    return {
      modelID,
      captured,
      recapture: makeRecapture(ifcAPI, modelID, captured, retainCaptured),
    }
  }

  // Open-path selection, most preferred first:
  //   1. OpenModelStreamed (conway #390, default): streamed columnar
  //      parse — no per-record object phase, the dominant JS-heap cost
  //      on large models. Conway falls back to the classic open
  //      internally on any streamed-parse failure, so this path never
  //      fails a load the classic one would survive. Opt out with the
  //      `disableStreamOpen` flag (inverted because `?feature=` can
  //      only turn flags on — `?feature=disableStreamOpen` reverts a
  //      session; flipping the flag's isActive is the prod kill
  //      switch).
  //   2. OpenModelAsync (conway #301 §2): yields to the event loop
  //      between progress ticks, so the backdrop/snackbar actually
  //      repaint and the browser stops flagging the tab as stalled.
  //   3. OpenModel: classic synchronous open (real web-ifc, old pins).
  // All feature-detected, so any engine pin keeps loading.
  let modelID
  if (!isFeatureEnabled('disableStreamOpen') && store !== null) {
    // eslint-disable-next-line new-cap
    modelID = await ifcAPI.OpenModelStream(store, openSettings)
    if (typeof modelID !== 'number' || modelID < 0) {
      data = await bytesFromSource(buffer)
      // eslint-disable-next-line new-cap
      modelID = await ifcAPI.OpenModelStreamed(data, openSettings)
    }
  } else if (!isFeatureEnabled('disableStreamOpen') && typeof ifcAPI.OpenModelStreamed === 'function') {
    // eslint-disable-next-line new-cap
    modelID = await ifcAPI.OpenModelStreamed(data, openSettings)
  } else if (typeof ifcAPI.OpenModelAsync === 'function') {
    // eslint-disable-next-line new-cap
    modelID = await ifcAPI.OpenModelAsync(data, openSettings)
  } else {
    // eslint-disable-next-line new-cap
    modelID = ifcAPI.OpenModel(data, openSettings)
  }
  if (typeof modelID !== 'number' || modelID < 0) {
    throw new Error(`parseIfcWithConway: OpenModel returned ${modelID}`)
  }
  const captured = []
  // eslint-disable-next-line new-cap
  ifcAPI.StreamAllMeshes(modelID, (flatMesh) => {
    captured.push(flatMesh)
  })
  // The classic path never streams, so `captured` is always whole and
  // `recapture` is the identity — the return shape stays uniform so
  // callers never branch on which open path ran.
  return {modelID, captured, recapture: () => captured}
}


/**
 * Build the whole-model accessor for ShareIfcLoader's DEGRADED end-of-load
 * builds — the readers that fire when the incremental assembly could not
 * produce a model (`builder === null`, `!builder.hasContent()`, or
 * `finalize()`/`assembleBatchedModel` throwing).
 *
 * When the pump's contents were retained this is the identity. When they
 * were dropped it re-extracts at the moment of failure instead, which is
 * the whole point of dropping: 475 MB is not worth holding against a
 * fallback that almost never runs.
 *
 * **What comes back is equivalent, not identical**, and both differences
 * matter to a reader comparing it against the pump's own output:
 *
 *   1. **Grouping.** On a deferred model the pinned `StreamAllMeshes`
 *      serves per-entity FULL FlatMeshes out of conway's `meshMap`, not the
 *      per-batch DELTA FlatMeshes the pump delivered. Same placement set,
 *      different bundling. Benign for both readers here — the merged and
 *      batched builds iterate placements and do not care how they arrive —
 *      but a future consumer that keyed on batch identity would.
 *   2. **Completeness under a budget.** `GEOMETRY_BUDGET_MB` is set on this
 *      path, and once conway has evicted anything, its whole-model serve
 *      filters out placements whose natives were freed. So on a model big
 *      enough to evict, this returns a strict SUBSET of what was pumped.
 *
 * That second one costs nothing that was not already gone, and the reason
 * is worth pinning down because it changed with the engine. On the RETAINED
 * deltas an evicted placement still names freed geometry, and conway#654's
 * `getGeometry` now probes `isNativeDeleted` and degrades to a dummy
 * IfcGeometry rather than aborting inside embind as it used to (the Sentry
 * SHARE-1NK shape). `flatMeshToBufferGeometry` then skips that dummy for
 * zero vertex/index size and counts it in `skippedPlacedGeometries`. So on
 * this pin BOTH routes render the same model — the geometry is gone either
 * way, because the native was freed.
 *
 * What the filtered re-extraction buys is therefore accounting, not pixels:
 * conway drops the placement before delivery and emits ONE aggregate
 * warning naming the instance and entity counts, where the retained route
 * logs a `[GetGeometry]` error per evicted placement and surfaces the loss
 * only as a `skippedPlacedGeometries` bump. Worth having, and small — do
 * not sell it as crash avoidance. The engine fixed the crash.
 *
 * Memoised because the two degraded builds are consecutive
 * (`buildBatchedConwayModel` then `buildConwayIfcModel`), and a second
 * `StreamAllMeshes` on a live model re-pushes into conway's still-populated
 * cache and doubles every triangle count — the defect
 * `IfcItemsMap.js` §"Why this is a separate entry point" documents from the
 * consumer side.
 *
 * Deliberately does NOT swallow a throw. Re-extraction is only wired up
 * where it is known to work (see `retainCaptured`), so a throw here is a
 * broken assumption, not an expected state; letting it reach
 * `ShareIfcLoader.parse`'s handler surfaces a real error to the user
 * instead of rendering an empty scene and calling it a load.
 *
 * @param {object} ifcAPI Conway IfcAPI bound to the model
 * @param {number} modelID
 * @param {Array} captured the retained stream (empty when dropped)
 * @param {boolean} retained whether `captured` holds the whole stream
 * @return {Function} `() => Array` of the whole model's FlatMeshes
 */
function makeRecapture(ifcAPI, modelID, captured, retained) {
  let recaptured = null
  return () => {
    if (retained) {
      return captured
    }
    if (recaptured === null) {
      const meshes = []
      // eslint-disable-next-line new-cap
      ifcAPI.StreamAllMeshes(modelID, (flatMesh) => {
        meshes.push(flatMesh)
      })
      // eslint-disable-next-line no-console
      console.info(
        `[conwayDirect] recaptured ${meshes.length} mesh(es) for a degraded ` +
        'end-of-load build')
      recaptured = meshes
    }
    return recaptured
  }
}


// Products extracted per demand batch: large enough that per-batch
// capture/render overhead amortizes, small enough that first pixels
// arrive within a couple of seconds of parse completing. The async
// (store-backed) path is smaller because each product pays OPFS
// prefetch before extract — see ExtractGeometryBatchAsync above.
/**
 * Cap on the native geometry conway keeps resident, in MB, for the deferred
 * path only. Least-recently-used assets are evicted at each pump batch.
 *
 * Measured engine-side on PSB (860 MB) at our batch size: the wasm high-water
 * falls from 1284 MB to 298 MB, with the geometry stage slightly faster
 * (23.6s against 25.7s) and identical delivered meshes. 256 MB was also
 * measured and buys much less (803 MB), because the live set rarely reaches
 * the ceiling. The heap runs 3-4x the budget — allocator overhead and
 * fragmentation — so this targets roughly a 300 MB residency, not 64 MB.
 *
 * Safe here for one specific reason: eviction frees an asset from
 * GetGeometry until something re-extracts it, and this loader copies every
 * payload at delivery (the bldrs-ai/Share#1640 invariant) — but "at
 * delivery" means between pump calls, in `onMeshBatch` below, after
 * `ExtractGeometryBatchAsync` returns and before the next pump call runs.
 * A batch delivered late in that window can still be evicted before
 * `IncrementalBatchedBuilder.appendBatch` (called synchronously from
 * `onMeshBatch`) finishes copying it out — conway's GEOMETRY_BUDGET eviction
 * raced the very copy this comment used to treat as instantaneous, and
 * embind then throws "Cannot pass deleted object as a pointer of type
 * IfcGeometry" reading the freed wrapper (Sentry SHARE-1NK). That fix has
 * since LANDED — conway#654 moved eviction to the head of the pump call, so
 * call N's delivered assets stay resident until call N+1 begins, and
 * `getGeometry` now probes `isNativeDeleted` and returns a dummy geometry
 * instead of aborting. The window is closed on this pin (1.1575.649);
 * independently, `IncrementalBatchedBuilder`
 * now degrades a boundary throw to one skipped placement (counted, logged)
 * rather than letting it escape and drop the whole batch, so the invariant
 * failing on some future engine version costs one part, not sixty-four.
 * A change that made this loader hold geometry IDs and fetch them later
 * would still break quietly, so the copy-at-delivery invariant remains
 * load-bearing rather than merely true.
 *
 * Ignored by engines predating conway#535 — unknown settings are dropped —
 * so ordering against the conway bump does not matter.
 */
const GEOMETRY_BUDGET_MB = 64

const DEMAND_EXTRACT_BATCH_SIZE = 64
const ASYNC_DEMAND_EXTRACT_BATCH_SIZE = 8


/**
 * A Blob/File the M1b store-backed open can read via `slice()`.
 *
 * @param {unknown} value
 * @return {boolean}
 */
function isBlobSource(value) {
  return value !== null && value !== undefined &&
    typeof value.size === 'number' && typeof value.slice === 'function' &&
    !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)
}


/**
 * Materialise a parse source as a Uint8Array (store-open fallback).
 *
 * @param {ArrayBuffer|Uint8Array|Blob} source
 * @return {Promise<Uint8Array>}
 */
async function bytesFromSource(source) {
  if (source instanceof Uint8Array) {
    return source
  }
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source)
  }
  if (typeof source?.arrayBuffer === 'function') {
    return new Uint8Array(await source.arrayBuffer())
  }
  throw new Error('parseIfcWithConway: cannot buffer source for fallback open')
}


/**
 * Yield to the event loop without background-tab timer throttling:
 * backgrounded tabs clamp setTimeout to >=1s, collapsing the pump to a
 * ~5% duty cycle. scheduler.yield() (and a MessageChannel fallback)
 * post ordinary tasks, which are not clamped, so loads keep their CPU
 * when the tab is backgrounded.
 *
 * @return {Promise<void>} resolves on the next event-loop task
 */
function yieldToEventLoop() {
  if (typeof globalThis.scheduler?.yield === 'function') {
    return globalThis.scheduler.yield()
  }
  if (typeof globalThis.MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        resolve()
      }
      channel.port2.postMessage(null)
    })
  }
  // Non-browser environments (tests); throttling doesn't apply there.
  return new Promise((resolve) => setTimeout(resolve, 0))
}


// web-ifc numeric log levels (conway's SetLogLevel shim uses the same
// numbering so an engine swap keeps working).
const ENGINE_LOG_LEVEL_DEBUG = 1
const ENGINE_LOG_LEVEL_WARN = 3


/**
 * Quiet the engine's console for a clean load (#301 §6): warnings/errors
 * only by default, everything (deduped log table included) under the
 * `glbVerbose` diagnostics flag. Feature-detected — old engine pins and
 * real web-ifc's wasm-side SetLogLevel both tolerate or lack this call.
 *
 * @param {object} ifcAPI
 */
function applyEngineLogLevel(ifcAPI) {
  if (typeof ifcAPI.SetLogLevel !== 'function') {
    return
  }
  try {
    // eslint-disable-next-line new-cap
    ifcAPI.SetLogLevel(
      isFeatureEnabled('glbVerbose') ? ENGINE_LOG_LEVEL_DEBUG : ENGINE_LOG_LEVEL_WARN)
  } catch (e) {
    debug(WARN).warn('conwayDirectIfcLoader#applyEngineLogLevel:', e)
  }
}


/**
 * Decorate a freshly-built Conway-direct Mesh with the runtime
 * surface call-sites expect from an IFC model. Idempotent — calling
 * twice on the same Mesh is a no-op (BVH already built, capabilities
 * already set, methods already attached).
 *
 * What gets attached / configured:
 *   - `computeBoundingBox`, `computeBoundingSphere` for fitToFrame +
 *     clipper bounds reads
 *   - `geometry.boundsTree` via `three-mesh-bvh`'s monkey-patched
 *     `computeBoundsTree` — fast picking; reorders the index buffer
 *     in place, so the `IfcInstanceMap` below is built AFTER
 *   - `mesh.instanceMap` — `IfcInstanceMap` from the post-reorder
 *     geometry attributes (per-vertex `expressID` + `instanceID`)
 *   - `mesh.capabilities` flips: `ifcSubsets: false`,
 *     `instancePicking: true`, `expressIdPicking: true`
 *   - `mesh.createSubset` / `mesh.removeSubset` via
 *     `attachInstanceMapSubsets` — instance-map-backed subset
 *     construction matching the cache-hit GLB path
 *   - Property/spatial method closures: `getItemProperties`,
 *     `getPropertySets`, `getSpatialStructure`, `getIfcType`. All
 *     route through `ifcAPI.properties.*` directly.
 *
 * @param {object} ifcModel freshly-built Conway-direct Mesh (output
 *   of `buildConwayIfcModel`)
 * @param {object} ifcAPI Conway IfcAPI bound to the model's modelID
 * @param {number} modelID
 * @param {object} [opts]
 * @param {object|null} [opts.scene] scene Object3D to parent subsets
 *   under as a fallback when source meshes haven't been added to the
 *   scene yet (passed through to `attachInstanceMapSubsets`)
 */
export function decorateConwayDirectIfcModel(ifcModel, ifcAPI, modelID, opts = {}) {
  const {scene = null} = opts
  ifcModel.modelID = modelID

  // `ifcManager` shim. Several call-sites discriminate "is this an
  // IFC model?" by checking `if (!m.ifcManager) { ... return }`
  // (see `CadView.jsx#onModel:438`); without this property, the
  // Conway-direct mesh is treated as a non-IFC model and the
  // model-loaded effects (NavTree population, search index, etc.)
  // are skipped entirely.
  //
  // Other call-sites reach into `ifcModel.ifcManager.getSpatialStructure(0, false)`
  // (IfcIsolator) and `ifcModel.ifcManager.ifcAPI` (Loader.js GLB
  // writer / various capture sites). The shim provides the small
  // surface those need, all backed by Conway directly. Methods
  // ignore the leading modelID arg and use the bound one.
  ifcModel.ifcManager = makeConwayDirectIfcManager(ifcAPI, modelID)

  // Bounds for fitToFrame + clipper. BufferGeometry would lazy-
  // compute on first access, but several consumers read bounds
  // eagerly (CutPlaneMenu, fitModelToFrame); explicit is cheaper
  // than the surprise.
  //
  // Optional-chained because tests `jest.mock('three')` and the
  // mocked Mesh/BufferGeometry don't have these methods. Real
  // BufferGeometry instances always do, so production behavior is
  // unchanged.
  ifcModel.geometry?.computeBoundingBox?.()
  ifcModel.geometry?.computeBoundingSphere?.()

  // BVH for fast hover-pick. `computeBoundsTree` is the monkey-patch
  // wit-three's IFCLoader's `initializeMeshBVH` installs at viewer
  // init — by Slice 5b time the patch is already on
  // `BufferGeometry.prototype` (the fork's `IfcViewerAPI` constructor
  // runs it during `new ShareViewer()`). Guarded with optional-call
  // in case the patch order ever changes.
  //
  // CRITICAL: this REORDERS the geometry's index buffer in place for
  // cache-coherent ray traversal. The pre-reorder `IfcInstanceMap`
  // returned by `buildConwayIfcModel` (keyed by emission position)
  // becomes wrong after the permute — the raycaster's `faceIndex` is
  // the post-reorder position, so the lookup mismatches and clicks
  // highlight the wrong instance. We rebuild a triangle-keyed map
  // from the post-reorder geometry attributes (per-vertex IDs stay
  // put, only the index buffer is permuted) so the new map matches
  // the geometry's actual layout.
  if (typeof ifcModel.geometry?.computeBoundsTree === 'function') {
    ifcModel.geometry.computeBoundsTree()
  }
  // Instance-map rebuild only runs when the geometry has the
  // expected attributes. Auto-mocked test BufferGeometry has none;
  // skip rather than throw. Real BufferGeometry always has them
  // because `flatMeshToBufferGeometry` sets them unconditionally.
  if (typeof ifcModel.geometry?.getIndex === 'function' &&
      ifcModel.geometry.getIndex() &&
      ifcModel.geometry.getAttribute?.('expressID') &&
      ifcModel.geometry.getAttribute?.('instanceID')) {
    // The pre-reorder map from `buildConwayIfcModel` carries the STEP
    // per-occurrence tables (`instanceIdToOccurrencePath` /
    // `occurrencePathToInstanceIds`), but the BVH permute forces a
    // rebuild from geometry attributes — and `instanceMapFromGeometry`
    // reads only `expressID` + `instanceID` per vertex, so it can't
    // recover the occurrence path (a variable-length array, not a
    // per-vertex scalar). Carry those tables forward by hand. The
    // synthetic instance ids line up 1:1: `flatMeshToBufferGeometry`
    // stamps per-vertex `instanceID` in the same emission order
    // `instanceMapFromOrderedPlacedRanges` numbered the build map, and
    // the reorder permutes only the index buffer, not that numbering.
    // Without this, scene→NavTree picks and per-occurrence tree
    // narrowing fall back to the colliding part-type expressID (every
    // reuse of a nut highlights together).
    const buildMap = ifcModel.instanceMap
    ifcModel.instanceMap = instanceMapFromGeometry(ifcModel.geometry)
    if (buildMap?.instanceIdToOccurrencePath || buildMap?.instanceIdToGeometryExpressId) {
      // Guard the 1:1 assumption instead of trusting it silently. If the two
      // populators ever number instances differently (e.g. one drops a
      // degenerate PlacedGeometry the other keeps), copying the tables over
      // would bind occurrence paths to the wrong instances — a silent
      // wrong-nut-highlights bug. On mismatch, skip the transfer and degrade
      // to type-level selection rather than mis-highlight.
      if (buildMap.instanceCount === ifcModel.instanceMap.instanceCount) {
        if (buildMap.instanceIdToOccurrencePath) {
          ifcModel.instanceMap.instanceIdToOccurrencePath = buildMap.instanceIdToOccurrencePath
          ifcModel.instanceMap.occurrencePathToInstanceIds = buildMap.occurrencePathToInstanceIds
        }
        // Same 1:1 carry for the per-instance geometry (solid) express ids —
        // per-vertex attributes can't encode them either, and they're the
        // second half of the (occurrencePath, solid expressID) identity that
        // per-solid selection joins on.
        if (buildMap.instanceIdToGeometryExpressId) {
          ifcModel.instanceMap.instanceIdToGeometryExpressId =
            buildMap.instanceIdToGeometryExpressId
        }
      } else {
        console.warn(
          '[conwayDirect] occurrence-path transfer skipped: instance-count mismatch ' +
          `(build ${buildMap.instanceCount}, geometry ${ifcModel.instanceMap.instanceCount}); ` +
          'STEP selection degrades to type-level for this model')
      }
    }
  }

  ifcModel.capabilities = ifcModel.capabilities ?? {}
  ifcModel.capabilities.ifcSubsets = false
  ifcModel.capabilities.instancePicking = true
  ifcModel.capabilities.expressIdPicking = true

  // Subset method backed by the instance map — matches the cache-hit
  // GLB path (`attachInstanceMapSubsets` from `elementSubsets.js`).
  // `fallbackParent` is passed through; production callers will have
  // the model parented before any subset construction (viewer.js
  // adds it to the scene), so `sourceMesh.parent` is set by the time
  // `createSubset` runs.
  attachInstanceMapSubsets(ifcModel, scene)

  attachConwayDirectModelMethods(ifcModel, ifcAPI, modelID)
}


/**
 * Build a minimal wit-three-`IFCManager`-shaped shim backed by
 * Conway. Provides just the surface call-sites read on
 * `model.ifcManager`:
 *
 *   - `getSpatialStructure(modelID, withProperties)` —
 *     `IfcIsolator.js` reads this. The leading modelID arg is
 *     ignored; the closure uses the modelID bound at decorate time.
 *   - `getItemProperties(modelID, expressID, recursive)` — used by
 *     downstream property capture if it falls through the
 *     model.getItemProperties path.
 *   - `getPropertySets(modelID, expressID, recursive)` — same.
 *   - `ifcAPI` — `Loader.js`'s GLB writer reads
 *     `viewer.IFC.loader.ifcManager.ifcAPI` to reach Conway directly;
 *     mirroring that reference here keeps the same shape work for
 *     any code that reaches via `model.ifcManager.ifcAPI`.
 *
 * @param {object} ifcAPI Conway IfcAPI
 * @param {number} modelID
 * @return {object} the shim
 */
export function makeConwayDirectIfcManager(ifcAPI, modelID) {
  return {
    ifcAPI,
    getSpatialStructure: (_modelIDArg, withProperties = false) =>
      ifcAPI.properties.getSpatialStructure(modelID, withProperties),
    getItemProperties: (_modelIDArg, expressID, recursive = false) =>
      ifcAPI.properties.getItemProperties(modelID, expressID, recursive),
    getPropertySets: (_modelIDArg, expressID, recursive = false) =>
      ifcAPI.properties.getPropertySets(modelID, expressID, recursive),
  }
}


/**
 * Attach property + spatial method closures on the model that
 * route through `ifcAPI.properties.*` directly. Matches the cache-
 * hit closure shape in `Loader.js#convertToShareModel` so consumer
 * call-sites don't branch on which backend they're hitting.
 *
 * @param {object} ifcModel
 * @param {object} ifcAPI
 * @param {number} modelID
 */
export function attachConwayDirectModelMethods(ifcModel, ifcAPI, modelID) {
  // Two-arg + single-arg calling conventions exist across consumers:
  //   - `(modelID, withProps)` — CadView.jsx, ShareViewer.getByFloor,
  //     IfcIsolator (mirrors `ifcManager.getSpatialStructure` shape)
  //   - `(withProps)` — cache-hit closure pattern
  // We accept both: if the first arg is a boolean or Conway's `'names'`
  // mode (and only one arg was passed), it's the `withProperties` flag;
  // otherwise the leading modelID is ignored and `withProperties` is
  // the second arg. `'names'` must pass through un-coerced — Conway's
  // shim reads it as the light per-node Name/LongName/GlobalId mode; a
  // bare boolean coercion here would silently upgrade it back to the
  // full-record `true` visit this mode exists to avoid. The model's
  // bound modelID is always used — closures are per-model.
  ifcModel.getSpatialStructure = function getSpatialStructure(...args) {
    const isMode = (v) => typeof v === 'boolean' || v === 'names'
    let withProps = false
    if (args.length === 1 && isMode(args[0])) {
      withProps = args[0]
    } else if (args.length >= 2) {
      withProps = isMode(args[1]) ? args[1] : Boolean(args[1])
    }
    // `includeSolids` (Conway ≥1.376.1184) surfaces STEP multibody sub-solids
    // as ephemeral `type: 'solid'` NavTree nodes (named SolidWorks bodies like
    // the NEMA 23 motor's `Boss-Extrude7`; anonymous solid dumps stay
    // suppressed engine-side). The IFC surface ignores the option. This is the
    // NavTree/search feed; the IfcIsolator path (`makeConwayDirectIfcManager`
    // above) intentionally stays product-only — hide/isolate keys on product
    // subsets and has no meaning for a sub-solid yet. See Conway
    // `design/new/step-nonproduct-semantics.md`.
    return ifcAPI.properties.getSpatialStructure(modelID, withProps, {includeSolids: true})
  }
  ifcModel.getItemProperties = (expressID, recursive = false) => {
    return ifcAPI.properties.getItemProperties(modelID, expressID, recursive)
  }
  ifcModel.getPropertySets = (expressID, recursive = false) => {
    return ifcAPI.properties.getPropertySets(modelID, expressID, recursive)
  }
  // getIfcType: identity. SearchIndex (`src/search/SearchIndex.js`)
  // reaches this through `Ifc.getType(model, elt)` →
  // `model.properties.getIfcType(elt.type)`, where the wrapping
  // `{properties: m}` makes `m.getIfcType` the lookup. Conway's
  // `properties.getSpatialStructure` already gives every node a
  // string `.type` ('IFCWALL', etc.), so we just hand it back. Matches
  // `Loader.js#convertToShareModel`'s cache-hit closure shape
  // (`model.getIfcType = (eltType) => eltType`). An async / Promise-
  // returning impl here breaks SearchIndex's downstream
  // `key.toLowerCase()` — see the cross-ref in that file.
  ifcModel.getIfcType = (eltType) => eltType
}

// GLB writer for the Bldrs runtime artifact pipeline.
//
// Companion to src/loader/glbCacheKey.js (read side). Given the parsed
// Three.js model that web-ifc-three / IFCLoader has already produced and
// rendered, serialize it to a GLB binary and write it to OPFS at the
// cache key. The reader fast path in Loader.js#tryLoadCachedGlb picks it
// up on subsequent loads of the same source.
//
// Design: design/new/glb-model-sharing.md §"Pipelines/A. Originator" and
// §"Caching and lookup".
//
// Why GLTFExporter (and not conway's GeometryAggregator + Convertor)?
// We tried the conway path first. Two failure modes surfaced:
//   1. The aggregator filters by `CanonicalMeshType.BUFFER_GEOMETRY`
//      (geometry_aggregator.js:32) and silently drops every other mesh
//      type. Complex IFCs (Bldrs_Plaza, Momentum, Seestrasse) lose
//      structural elements that conway hadn't finalized to triangle
//      meshes, and the cached artifact renders as a fragmented skeleton.
//   2. Conway emits geometry at IFC source-world coordinates; the GLB
//      ends up thousands of units from origin, outside the orbit
//      control's fit-to-frame range.
// Both go away if we serialize what web-ifc-three already produced — the
// scene that's already on screen and known to render correctly. The
// tradeoff: GLBs are bigger than what conway's aggregator could produce
// (no de-instancing, no Draco). Acceptable for the cache MVP; revisit
// once the BLDRS_* extension story makes a custom writer worthwhile.
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js'
import {writeGlbBytesToOPFS} from '../OPFS/utils'
import {yieldToBrowser} from '../utils/scheduling'
import {
  BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME,
  captureBldrsElementProperties,
} from './bldrsElementProperties'
import {
  BLDRS_FACE_IDS_EXTENSION_NAME,
  buildFaceIdsExtensionData,
  captureGeometryItemIdentities,
  capturePerTriangleIds,
} from './bldrsFaceIds'
import {
  BLDRS_SPATIAL_TREE_EXTENSION_NAME,
  captureBldrsSpatialTree,
} from './bldrsSpatialTree'
import {eachBatch} from '../viewer/ifc/batchedModel'
import {
  batchedModelOccurrenceTables,
  batchedModelToMergedMesh,
  disposeMergedMesh,
} from '../viewer/ifc/batchedToMergedMesh'
import {BLDRS_GLB_BATCHED_SCHEMA_VERSION, glbCacheKey} from './glbCacheKey'
import {
  activeGlbCompressionMode,
  compressGlb,
  isGlbBatchedActive,
  schemaVersionFor,
} from './glbCompress'
import {
  BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
  buildInstanceTablesExtensionData,
} from './bldrsInstanceTables'
import {exportBatchedModelAsInstancedGlb} from './glbBatchedExport'
import {packGlbChunks} from './glbContainer'
import {glbInfo, glbVerbose} from './glbLog'
import {injectAndPackInWorker} from './GlbWriterService'
import {injectGlbExtensions, parseGlb} from './injectGlbExtensions'


// Key under `scenes[0].extras` carrying the IFC project title across
// the GLB cache round-trip. three.js GLTFLoader auto-promotes
// `scene.extras` to `scene.userData`, so the reader at
// `Loader.js#convertToShareModel` finds it at
// `model.userData.bldrsTitle` with no custom plugin needed.
//
// Both call sites import this constant — writer stamps under it,
// reader reads from it. Single source of truth; bumping the key here
// flips both ends atomically.
export const BLDRS_TITLE_EXTRAS_KEY = 'bldrsTitle'


/**
 * Serialize a Three.js Object3D (typically the IFCLoader-produced model)
 * to a single GLB ArrayBuffer. Resolves to null on failure rather than
 * throwing — the source model is already loaded; the cache write is a
 * fire-and-forget warm-up.
 *
 * Note on console noise: GLTFExporter emits one `console.warn` per
 * non-PBR material (`MeshStandardMaterial`/`MeshBasicMaterial`
 * recommended). web-ifc-three's IFCLoader produces `MeshLambertMaterial`,
 * so a typical IFC fires dozens of these warnings. They aren't
 * actionable from our side without rewriting every material to PBR
 * (which would change appearance), so we silence GLTFExporter's
 * specific message during parse and let other warnings through.
 *
 * @param {object} model Three.js root (Mesh / Group / Scene)
 * @return {Promise<Uint8Array|null>}
 */
export function exportThreeModelAsGlb(model) {
  return new Promise((resolve) => {
    const restoreConsoleWarn = silenceGltfExporterMaterialWarnings()
    const finish = (value) => {
      restoreConsoleWarn()
      resolve(value)
    }
    try {
      const exporter = new GLTFExporter()
      exporter.parse(
        model,
        (result) => {
          if (result instanceof ArrayBuffer) {
            finish(new Uint8Array(result))
          } else {
            // Non-binary mode shouldn't fire here, but guard anyway.
            glbInfo('writer: GLTFExporter returned non-binary; skipping')
            finish(null)
          }
        },
        (err) => {
          glbInfo('writer: GLTFExporter onError:', err)
          finish(null)
        },
        {binary: true},
      )
    } catch (e) {
      glbInfo('writer: GLTFExporter threw:', e)
      finish(null)
    }
  })
}


/**
 * Wrap `console.warn` for the duration of a GLTFExporter `parse` call
 * to swallow the per-material "Use MeshStandardMaterial or
 * MeshBasicMaterial for best results" warning. Returns a restore
 * function the caller invokes when parse settles. Counts suppressed
 * warnings and surfaces a single summary line via glbVerbose.
 *
 * @return {Function} restore — call to undo the patch
 */
function silenceGltfExporterMaterialWarnings() {
  const originalWarn = console.warn
  let suppressed = 0
  console.warn = function patchedWarn(...args) {
    if (typeof args[0] === 'string' && args[0].startsWith('GLTFExporter: Use MeshStandardMaterial')) {
      suppressed++
      return
    }
    originalWarn.apply(this, args)
  }
  return () => {
    console.warn = originalWarn
    if (suppressed > 0) {
      glbVerbose(`writer: silenced ${suppressed} GLTFExporter material warnings`)
    }
  }
}


/**
 * True when the model root is, or contains, a `THREE.BatchedMesh`. Such
 * models come from the Conway-direct instancing path (`?feature=batchedMesh`)
 * and are baked back to a merged mesh before serialising (see
 * `exportAndCacheGlb`), since `GLTFExporter` can't serialise a packed batch.
 *
 * @param {object} model Three.js root (Mesh / Group / Scene / BatchedMesh)
 * @return {boolean}
 */
function modelHasBatchedMesh(model) {
  let found = false
  eachBatch(model, () => {
    found = true
  })
  return found
}


/**
 * Export the loaded model and write the resulting GLB (wrapped in the
 * Bldrs container) to OPFS at the cache key the reader will look for.
 * Fire-and-forget at the call site — any failure is logged but never
 * thrown. Returns true if a GLB was written, false otherwise.
 *
 * @param {object} args
 * @param {object} args.model The parsed Three.js root
 * @param {string} args.kindLabel Human-readable source-kind tag for logs
 *   (e.g. 'github', 'local', 'upload', 'external'). Not used as a cache key.
 * @param {object} args.cacheKeyArgs Output of one of the sourceCacheKey
 *   adapters: {ns1, ns2, ns3, sourcePath, sourceHash}.
 * @param {object} [args.ifcManager] IfcManager-like with
 *   `getSpatialStructure`, `getItemProperties`, `getPropertySets`
 *   — typically `viewer.IFC.loader.ifcManager`. When provided and the
 *   source is an IFC parse with live parser state, the spatial
 *   structure is captured as a `BLDRS_spatial_tree` extension AND the
 *   element-properties closure (BFS through IFC references from
 *   spatial-tree elements) is captured as `BLDRS_element_properties`
 *   so cache-hit GLBs render NavTree and Properties panel without
 *   re-parsing. Pass `null` for non-IFC sources or when no live
 *   parser state is available.
 * @return {Promise<boolean>}
 */
export async function exportAndCacheGlb({model, kindLabel, cacheKeyArgs, ifcManager = null}) {
  const startMs = Date.now()
  try {
    // BatchedMesh render path (`?feature=batchedMesh`): `GLTFExporter` can't
    // serialise a `THREE.BatchedMesh`'s packed buffer, and a batch carries
    // no per-vertex `_EXPRESSID` for the `BLDRS_face_ids` picking capture.
    // Bake it into the same merged-mesh shape the Conway-direct merged path
    // produces (per-vertex expressID/instanceID + colour-binned materials);
    // the resulting GLB is byte-compatible with a merged cache artifact and
    // reads back through the existing cache-hit path unchanged
    // (design/new/viewer-replacement.md §3b.iv). The bake is transient —
    // disposed right after serialisation below.
    const isBatched = modelHasBatchedMesh(model)
    const filePath = cacheKeyArgs.sourcePath
    const requestedMode = activeGlbCompressionMode()
    glbInfo(
      `writer: ${kindLabel} source, key=${cacheKeyArgs.ns1}/${cacheKeyArgs.ns2}/${cacheKeyArgs.ns3}/` +
      `${filePath} sha=${cacheKeyArgs.sourceHash} requestedCompression=${requestedMode || 'none'}`)
    glbVerbose('writer: cacheKeyArgs =', cacheKeyArgs)

    // Batched-NATIVE layout (S9, `?feature=glbBatched`): keep the batch
    // structure via EXT_mesh_gpu_instancing + per-instance tables instead
    // of de-instancing into the merged bake. `batchedTables` non-null is
    // the discriminator for every layout decision below (no face_ids, no
    // compression, batched schema slot). Fail-soft: a null export (shear,
    // missing attributes) falls through to the merged path — that artifact
    // lands in the MERGED slot, so a flag-on reader will simply keep
    // missing for that model rather than ever reading a wrong layout.
    let rawBytes
    let batchedTables = null
    if (isBatched && isGlbBatchedActive()) {
      const batchedNative = await exportBatchedModelAsInstancedGlb(model)
      if (batchedNative) {
        rawBytes = batchedNative.bytes
        batchedTables = batchedNative.tableNodes
        glbVerbose('writer: batched-native export produced', rawBytes.byteLength, 'bytes')
      } else {
        glbInfo('writer: batched-native export declined; falling back to merged bake')
      }
    }

    if (rawBytes === undefined) {
      const exportModel = isBatched ? batchedModelToMergedMesh(model) : model
      if (isBatched && !exportModel) {
        glbInfo('writer: skipped (batched model produced no exportable geometry)')
        return false
      }
      if (isBatched) {
        glbVerbose('writer: baked BatchedMesh model to a merged mesh for export')
      }
      rawBytes = await exportThreeModelAsGlb(exportModel)
      // The baked mesh is a transient, off-scene copy; free its buffers now
      // that the bytes are captured (the source batched model is untouched).
      if (exportModel !== model) {
        disposeMergedMesh(exportModel)
      }
      if (!rawBytes || rawBytes.byteLength === 0) {
        glbInfo('writer: skipped (GLTFExporter produced no bytes)')
        return false
      }
      glbVerbose('writer: GLTFExporter produced', rawBytes.byteLength, 'bytes')
    }
    // IFC project title captured at write time — set by
    // IfcViewerAPIExtended.parse from Conway's `statsApi.projectName`
    // (e.g. "Momentum"). Passed to the inject step below so it lands
    // in `scenes[0].extras.bldrsTitle` in the SAME parse/serialize
    // pass that handles BLDRS_* extensions — no extra round-trip on
    // the raw bytes. Non-IFC sources (drag-dropped OBJ etc.)
    // generally have no `.name`; the inject step no-ops on nullish.
    const titleForExtras = (typeof model?.name === 'string' && model.name) ? model.name : null
    // Yield to the event loop between major phases so hover-pick /
    // camera-controls can interleave with the writer. Each `yieldToBrowser`
    // is a single macrotask boundary; the cost is one event-loop turn,
    // the benefit is the main thread gets a chance to render + respond
    // to pointer events between phases. GLTFExporter (above) and DRACO
    // encoding (below, when active) still block synchronously inside —
    // those are the next slice's worker-move targets.
    await yieldToBrowser()
    // Capture BLDRS_* extension payloads from the live IFC parser state
    // before it goes out of scope. Runs in parallel with `compressGlb`
    // below to overlap the two costs (Conway sync iteration + DRACO/
    // Meshopt encoder).
    //
    // Element properties depend on the spatial tree (the slow-path BFS
    // uses tree expressIDs as BFS seeds; the fast path ignores it), so
    // the two captures are sequential rather than parallel.
    const modelId = model?.modelID ?? 0
    // Capture per-triangle element IDs from the pristine raw bytes
    // BEFORE any compression. The vertex-level `_EXPRESSID` /
    // `_INSTANCEID` attributes are still intact here; we read them
    // and project to per-triangle (taking vertex 0's ID per
    // triangle, matching `instanceMapFromGeometry`'s assumption that
    // a triangle's 3 vertices share the same parent). The resulting
    // per-triangle arrays will go into `BLDRS_face_ids` so the
    // reader can rebuild `IfcInstanceMap` without trusting the
    // post-compression per-vertex attributes (which DRACO would
    // quantise-corrupt and Meshopt would weld-merge).
    //
    // Sync — parse + array read; no I/O. Safe to run before the
    // parallel async captures below.
    let faceIds = null
    // Per-triangle face_ids are a MERGED-layout concept (identity hung off
    // the giant vertex slab). The batched-native artifact keeps instances
    // first-class and carries per-instance identity in
    // BLDRS_instance_tables instead — capturing face_ids from its bytes
    // would find no per-vertex `_EXPRESSID` anyway.
    if (!batchedTables) {
      try {
        const {json, bin} = parseGlb(rawBytes)
        faceIds = capturePerTriangleIds(json, bin)
        if (faceIds) {
          const primCount = faceIds.perPrimitive.filter((p) => p).length
          const triTotal = faceIds.perPrimitive.reduce(
            (n, p) => n + (p?.expressIds?.length ?? 0), 0)
          glbVerbose(
            `writer: captured per-triangle IDs from ${primCount} primitive(s) — ` +
            `${triTotal.toLocaleString()} triangles`)
        }
      } catch (e) {
        // Intentional: swallow + continue. If parseGlb threw on bytes
        // we just got from GLTFExporter, we have bigger problems than
        // face_ids — the cache write itself will catch it. The skip
        // here also flows downstream: with `faceIds == null`,
        // `preserveTriangleOrder` stays false, so compressGlb falls
        // back to the per-vertex-IDs-detected skip (uncompressed
        // write) rather than running DRACO with corrupted IDs.
        console.warn(
          '[glb] writer: parseGlb for face_ids capture threw; ' +
          'skipping face_ids (DRACO will skip too):', e)
      }
    }
    // STEP per-occurrence identity. The per-triangle arrays above only
    // carry the scalar instance id; the occurrence path (a variable-length
    // NAUO chain) lives on the live instance map. Persist the global
    // `instanceId → path` table alongside face_ids so a cache-hit STEP
    // model can restore per-occurrence NavTree↔scene selection instead of
    // collapsing to the shared part-type id. Absent for IFC.
    if (faceIds) {
      let occurrencePaths = model?.instanceMap?.instanceIdToOccurrencePath ?? null
      // Per-instance geometry (solid) express ids — the other half of the
      // (occurrencePath, solid expressID) identity per-solid selection of
      // multibody STEP parts joins on. Same rationale as the paths above:
      // per-triangle arrays carry only the scalar instance id. Absent for IFC.
      let geometryExpressIds = model?.instanceMap?.instanceIdToGeometryExpressId ?? null
      // Batched render path (demandGeometry default / ?feature=batchedMesh):
      // the model is a THREE.BatchedMesh with NO `instanceMap` — its
      // per-occurrence tables live on the batch meshes, keyed by batchId.
      // `batchedModelToMergedMesh` (above) baked each vertex's `instanceID`
      // from the global occurrence id, so re-key the occurrence tables to that
      // same id space; otherwise a batched-first load caches with no occurrence
      // data and the scene per-occurrence highlight can't restore on cache-hit
      // (the NavTree still can — the spatial tree persists paths separately).
      if (!Array.isArray(occurrencePaths) && isBatched) {
        const occurrenceTables = batchedModelOccurrenceTables(model)
        occurrencePaths = occurrenceTables.occurrencePaths
        geometryExpressIds = occurrenceTables.geometryExpressIds
      }
      if (Array.isArray(occurrencePaths)) {
        faceIds.occurrencePaths = occurrencePaths
      }
      // Geometry (solid) ids — and their identity table — are persisted only
      // when the model also carries occurrence paths (STEP): every reader-side
      // join on a geometry id is occurrence-path-gated (per-solid narrowing in
      // getInstanceIdsForOccurrencePath, "Face #" transient rows), so for IFC
      // the table has no consumer, and the identity sweep below provably
      // resolves nothing (Conway IFC entities have numeric types, which the
      // capture skips) while costing one async property lookup per DISTINCT
      // geometry id — minutes of write-time on big IFCs for an empty result.
      if (Array.isArray(occurrencePaths) && Array.isArray(geometryExpressIds)) {
        faceIds.geometryExpressIds = geometryExpressIds
        // Identity table for those geometry pieces (conway#387): distinct
        // id → {type, name}, resolved through the live parser we have RIGHT
        // NOW so a cache-hit load can label transient NavTree rows and the
        // Properties panel without one. Small: one entry per distinct
        // geometry id (hundreds on NEMA-class parts), not per instance.
        const identitiesStartMs = Date.now()
        faceIds.geometryItemIdentities = await captureGeometryItemIdentities(
          ifcManager, modelId, geometryExpressIds)
        glbVerbose(
          `writer: geometry identity sweep took ${Date.now() - identitiesStartMs}ms ` +
          `(${Object.keys(faceIds.geometryItemIdentities ?? {}).length} identities)`)
      }
    }
    await yieldToBrowser()
    const capturePromise = (async () => {
      // Per-phase timing (glbVerbose): the writer's post-export phases are
      // otherwise silent for minutes on big models, which makes write stalls
      // unattributable from the console (#1639 follow-up observation).
      const treeStartMs = Date.now()
      const spatialTree = await captureBldrsSpatialTree(ifcManager, modelId)
      glbVerbose(`writer: spatial-tree capture took ${Date.now() - treeStartMs}ms`)
      await yieldToBrowser()
      const propsStartMs = Date.now()
      const elementProperties = await captureBldrsElementProperties(
        ifcManager, modelId, spatialTree)
      glbVerbose(`writer: element-properties capture took ${Date.now() - propsStartMs}ms`)
      return {spatialTree, elementProperties}
    })()
    // Compress FIRST, then inject. `@gltf-transform/core`'s `WebIO`
    // (used inside `compressGlb`) parses the GLB into a Document and
    // re-serialises it, which **silently drops any extension it
    // doesn't have a registered handler for** — our `BLDRS_*`
    // extensions vanish if injected before compression runs. Order
    // matters: inject must come *after* compression so our extensions
    // ride along untouched in the final BIN chunk.
    //
    // `preserveTriangleOrder` signals that the reader will use
    // `BLDRS_face_ids` for picking — the IDs are per-triangle by
    // pre-compression order, so compression must not reorder triangles.
    // DRACO has a `sequential` mode that preserves order; we pass the
    // flag through so compressGlb can pick the right encoder method.
    // Meshopt's default pipeline reorders triangles for vertex-cache
    // coherency without an off-switch we can find, so it stays
    // skipped for face_ids-bearing GLBs.
    //
    // Use the *actual* compression mode (compressGlb may fall back to
    // null on encoder failure) so the cached artifact lands in the
    // matching schema slot. Otherwise a -draco / -meshopt suffix on
    // uncompressed bytes would mislead a reader running with the same
    // flag (it would expect compressed input on the next load).
    const compressStartMs = Date.now()
    // Batched-native v1 is always uncompressed: DRACO/Meshopt assume the
    // merged single-primitive layout (and would strip the instancing
    // extension through gltf-transform's re-serialize). mode stays null so
    // the container's mode byte matches what activeArtifactSpec's reader
    // side expects for the batched slot.
    const {bytes: compressedBytes, mode} = batchedTables ?
      {bytes: rawBytes, mode: null} :
      await compressGlb(rawBytes, requestedMode, {preserveTriangleOrder: !!faceIds})
    glbVerbose(`writer: compress phase took ${Date.now() - compressStartMs}ms (mode=${mode || 'none'})`)
    await yieldToBrowser()
    const {spatialTree, elementProperties} = await capturePromise
    await yieldToBrowser()
    const faceIdsData = faceIds ? buildFaceIdsExtensionData(faceIds) : null
    // Dispatch the JSON.stringify + pako.gzip + extension injection +
    // container packing to the GlbWriter worker. On Schependomlaan-
    // class IFCs the spatial-tree / face-ids payloads are multi-MB;
    // running their `JSON.stringify` + `pako.gzip` on the main thread
    // costs ~300-500ms of frozen hover-pick. Moving them to the worker
    // eliminates that block — the main thread only pays the
    // structured-clone cost across postMessage (~50ms on a
    // Schependomlaan payload, scales sublinearly with size).
    // (The element-properties payload always arrives as already-
    // compressed container bytes from the capture — see below — so
    // for it the worker only splices bytes; the stringify+gzip
    // offload applies to the other extensions.)
    //
    // The fallback path runs everything inline (no worker) — used
    // when the worker fails to construct (Safari edge cases,
    // module-worker support detection failure). Same result either
    // way; the only observable difference is main-thread freeze
    // duration.
    // The element-properties capture (both streaming and slow paths)
    // hands back the block-indexed container bytes — pass them
    // through as `precompressed` so neither this thread nor the
    // worker re-materialises the payload. Nullish when no capture ran
    // (non-IFC source); the inject filter drops the entry.
    const extensionsForInject = [
      {name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: spatialTree, compress: true},
      {name: BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME, precompressed: elementProperties?.compressedBytes},
      {name: BLDRS_FACE_IDS_EXTENSION_NAME, data: faceIdsData, compress: true},
      // Batched-native only (null data drops out of the inject filter):
      // per-instance identity + verbatim source colors, node-order-keyed
      // to the EXT_mesh_gpu_instancing nodes in the same GLB.
      {
        name: BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
        data: batchedTables ? buildInstanceTablesExtensionData(batchedTables) : null,
        compress: true,
      },
    ]
    // Scene-level metadata that rides along in the same inject pass
    // — no extra parse/serialize. The project title is stamped twice:
    // under `BLDRS_TITLE_EXTRAS_KEY` in `scenes[0].extras` (the
    // Bldrs-only carrier the reader hydrates the page title from) AND
    // into the standard glTF `scenes[0].name` field (#1595) so
    // generic viewers — the three.js editor's navtree, Babylon
    // sandbox — show the model name instead of GLTFExporter's
    // 'AuxScene' placeholder. Null when no title is available so
    // `injectGlbExtensions` no-ops both scene mutations.
    const sceneExtrasForInject = titleForExtras ?
      {[BLDRS_TITLE_EXTRAS_KEY]: titleForExtras} :
      null
    let packed
    let extStats
    try {
      const workerResult = await injectAndPackInWorker({
        bytes: compressedBytes,
        mode,
        extensions: extensionsForInject,
        sceneExtras: sceneExtrasForInject,
        sceneName: titleForExtras,
      })
      packed = workerResult.bytes
      extStats = workerResult.extStats
    } catch (workerErr) {
      glbInfo('writer: worker dispatch failed, running inline on main thread:', workerErr)
      const inline = injectGlbExtensions(
        compressedBytes, extensionsForInject, sceneExtrasForInject, titleForExtras)
      extStats = inline.stats
      packed = packGlbChunks([inline.bytes], mode)
    }
    if (extStats.addedExtensions > 0) {
      glbVerbose(
        `writer: injected ${extStats.addedExtensions} extension(s)`)
    }
    if (extStats.addedSceneExtras > 0) {
      glbVerbose(
        `writer: stamped ${extStats.addedSceneExtras} scene.extras key(s) (title="${titleForExtras}")`)
    }
    if (extStats.addedSceneName > 0) {
      glbVerbose(`writer: stamped standard scenes[0].name = "${titleForExtras}"`)
    }
    // Batched-native artifacts land in their own schema slot so flag-off
    // readers never see them (glbCacheKey#BLDRS_GLB_BATCHED_SCHEMA_VERSION).
    const schemaVer = batchedTables ?
      BLDRS_GLB_BATCHED_SCHEMA_VERSION :
      schemaVersionFor(mode)
    const key = glbCacheKey({...cacheKeyArgs, schemaVer})
    await writeGlbBytesToOPFS(
      packed, key.originalFilePath, key.commitHash, key.owner, key.repo, key.branch)
    glbInfo(
      `writer: wrote ${packed.byteLength}B (1 chunk${mode ? `, ${mode}-compressed` : ''}) ` +
      `to ${key.owner}/${key.repo}/${key.branch}/${key.originalFilePath} in ${Date.now() - startMs}ms`)
    return true
  } catch (e) {
    glbInfo('writer: skipped (threw); reader will fall back to source on next load:', e)
    return false
  }
}

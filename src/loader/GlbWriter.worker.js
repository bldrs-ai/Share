// GLB writer worker — runs the JSON.stringify + pako.gzip +
// extension injection + container packing off the main thread so
// hover-pick / camera-controls stay responsive during the post-IFC-
// parse write.
//
// What this worker handles (post-GLTFExporter, post-compression):
//   - JSON.stringify on the per-extension payload (multi-MB nested
//     objects on big IFCs; `BLDRS_element_properties` arrives as
//     precompressed container bytes and skips this)
//   - pako.gzip on the resulting bytes (CPU-bound)
//   - injectGlbExtensions byte-splice (sync but fast once stringify
//     + gzip are done)
//   - packGlbChunks (Bldrs container wrap + the container's own gzip,
//     ~1.7 s on a 68 MB artifact — the single biggest item here since
//     #1855, and the reason this handler is async)
//
// Also, since open-205 #2030 target 1, the batched-native writer's build
// (`build-batched-glb`, below): shape rebuild + content interning, TRS
// decomposition, the collapse bake, the gltf-transform document and its
// `writeBinary`, and the slim pass. That was a single 6.0 s main-thread task
// on sp-231MB. The main thread now only snapshots the batches
// (`glbBatchedSnapshot.js`) and transfers the copies here.
//
// What stays on main thread (intentionally — moving these is the
// Phase 5 next-slice work):
//   - GLTFExporter.parse (merged-layout fallback only) (needs the three.js scene graph; not
//     trivially serialisable through postMessage)
//   - captureBldrsSpatialTree / captureBldrsElementProperties (need
//     live IfcManager + Conway adapter state; live IfcAPI is on the
//     main thread because wit-three's IFCLoader instantiated it there)
//   - capturePerTriangleIds (small, sync on the raw bytes; could
//     move but cost is in the tens-of-ms range and pre-compression
//     ordering matters)
//   - compressGlb (DRACO encoder loads via `<script>` tag injection
//     on `document.head`, which doesn't exist in a worker; the
//     classic-worker `importScripts` route is the obvious port but
//     adds bundle plumbing that's not on the critical path for the
//     reported freeze — DRACO is opt-in via `?feature=glbDraco`)
//
// Message protocol (request):
//   {
//     command: 'inject-and-pack',
//     id: <correlation id>,
//     bytes: Uint8Array,             // transferable — GLB
//                                      (compressed or not, depending
//                                      on main-thread compression
//                                      mode)
//     mode: 'draco' | 'meshopt' | null,
//     extensions: [
//       {name: 'BLDRS_spatial_tree',      data: object|null, compress: true},
//       {name: 'BLDRS_element_properties', precompressed: Uint8Array|undefined},
//       {name: 'BLDRS_face_ids',          data: object|null, compress: true},
//     ],
//     sceneExtras: {                  // optional small string-keyed
//       bldrsTitle: 'Project Name',   // metadata merged into
//       ...                           // scenes[0].extras for auto-
//     } | null,                       // promotion to scene.userData
//     sceneName: 'Project Name'       // optional standard glTF
//       | null,                       // scenes[0].name stamp (#1595)
//   }
//
// Reply (success — packed final container bytes, transferable):
//   { command: 'inject-and-pack:done', id, ok: true,
//     bytes: Uint8Array, extStats }
//
// Reply (failure):
//   { command: 'inject-and-pack:done', id, ok: false, error: string }
//
// Second command (request):
//   {
//     command: 'build-batched-glb',
//     id: <correlation id>,
//     snapshot: object,   // `glbBatchedSnapshot#snapshotBatchedModel`;
//                         // its typed-array buffers are transferred
//     collapse: boolean,
//   }
//
// Reply (success; `built` is `buildInstancedGlbFromSnapshot`'s result, its
// `bytes` transferred, or null when the model can't be written batched):
//   { command: 'build-batched-glb:done', id, ok: true, built, logs: string[] }
//
// Reply (failure):
//   { command: 'build-batched-glb:done', id, ok: false, error: string }
//
// `logs` carries the writer's verbose diagnostics back for the main thread
// to replay through `glbVerbose` — the flag that gates them is read from
// the page URL, which a worker can't see.

import {buildInstancedGlbFromSnapshot} from './glbBatchedBuild'
import {packGlbChunks} from './glbContainer'
import {injectGlbExtensions} from './injectGlbExtensions'


/**
 * Run the batched-native build for a snapshot and post the result back.
 *
 * @param {object} data the `build-batched-glb` request
 */
async function buildBatched(data) {
  const {id, snapshot, collapse} = data
  const logs = []
  try {
    const built = await buildInstancedGlbFromSnapshot(
      snapshot, {collapse}, (line) => logs.push(line))
    self.postMessage(
      {command: 'build-batched-glb:done', id, ok: true, built, logs},
      built ? [built.bytes.buffer] : [],
    )
  } catch (e) {
    self.postMessage({
      command: 'build-batched-glb:done',
      id,
      ok: false,
      error: e?.message || String(e),
    })
  }
}


// Async because `packGlbChunks` is: the container gzips its payload through
// `CompressionStream`, which has no synchronous form (#1855). That deflate
// is the bulk of this worker's ~1.7 s on a Snowdon-sized artifact and is
// exactly the kind of work the worker exists to keep off the main thread.
self.addEventListener('message', async (event) => {
  const data = event.data
  if (data?.command === 'build-batched-glb') {
    await buildBatched(data)
    return
  }
  if (!data || data.command !== 'inject-and-pack') {
    return
  }
  const {id, bytes, mode, extensions, sceneExtras, sceneName} = data
  try {
    const {bytes: withExtensions, stats: extStats} =
      injectGlbExtensions(bytes, extensions, sceneExtras, sceneName)
    const packed = await packGlbChunks([withExtensions], mode)
    // Transfer the final bytes back zero-copy. The Uint8Array's
    // underlying ArrayBuffer is in the transferables list, so the
    // worker side loses access after postMessage returns — fine, we
    // don't reuse it.
    self.postMessage(
      {
        command: 'inject-and-pack:done',
        id,
        ok: true,
        bytes: packed,
        extStats,
      },
      [packed.buffer],
    )
  } catch (e) {
    self.postMessage({
      command: 'inject-and-pack:done',
      id,
      ok: false,
      error: e?.message || String(e),
    })
  }
})

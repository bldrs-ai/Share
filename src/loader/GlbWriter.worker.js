// GLB writer worker — runs the JSON.stringify + pako.gzip +
// extension injection + container packing off the main thread so
// hover-pick / camera-controls stay responsive during the post-IFC-
// parse write.
//
// What this worker handles (post-GLTFExporter, post-compression):
//   - JSON.stringify on the per-extension payload (heavy on
//     `BLDRS_element_properties` — multi-MB nested objects on big
//     IFCs)
//   - pako.gzip on the resulting bytes (CPU-bound)
//   - injectGlbExtensions byte-splice (sync but fast once stringify
//     + gzip are done)
//   - packGlbChunks (Bldrs container wrap, ~ms)
//
// What stays on main thread (intentionally — moving these is the
// Phase 5 next-slice work):
//   - GLTFExporter.parse (needs the three.js scene graph; not
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
//       {name: 'BLDRS_element_properties', data: object|null, compress: true},
//       {name: 'BLDRS_face_ids',          data: object|null, compress: true},
//     ],
//   }
//
// Reply (success — packed final container bytes, transferable):
//   { command: 'inject-and-pack:done', id, ok: true,
//     bytes: Uint8Array, extStats }
//
// Reply (failure):
//   { command: 'inject-and-pack:done', id, ok: false, error: string }

import {packGlbChunks} from './glbContainer'
import {injectGlbExtensions} from './injectGlbExtensions'


self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.command !== 'inject-and-pack') {
    return
  }
  const {id, bytes, mode, extensions} = data
  try {
    const {bytes: withExtensions, stats: extStats} = injectGlbExtensions(bytes, extensions)
    const packed = packGlbChunks([withExtensions], mode)
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

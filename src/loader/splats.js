import {BoxGeometry, Group} from 'three'
import debug from '../utils/debug'


// Share extension → Spark SplatFileType enum value (see
// @sparkjsdev/spark defines.d.ts). String literals instead of the enum
// itself so this module carries no static spark import — spark (~5MB
// pre-minify: renderer + inlined wasm sorter) loads only when a splat
// model is actually opened, via the dynamic import below.
// '.sog' is PlayCanvas's single-file SOG bundle, a zip — Spark calls
// that PCSOGSZIP (bare-meta.json PCSOGS is multi-file and out of scope,
// see #1726).
const SPARK_FILE_TYPE_BY_EXT = {
  ksplat: 'ksplat',
  ply: 'ply',
  sog: 'pcsogszip',
  splat: 'splat',
  spz: 'spz',
}


/** Extensions routed to the splat loader, in Filetype.supportedTypes form. */
export const splatTypes = Object.keys(SPARK_FILE_TYPE_BY_EXT)


let sparkModulePromise = null
// The resolved module, kept for the synchronous fixup below — it only
// runs after a parse has awaited the import, so this is always set by
// then.
let spark = null


/** @return {Promise<object>} the spark module namespace */
function loadSpark() {
  if (sparkModulePromise === null) {
    sparkModulePromise = import('@sparkjsdev/spark').then((module) => {
      spark = module
      return module
    }).catch((importError) => {
      // Never cache a rejected import: the ~5MB chunk failing once on a
      // flaky network would otherwise fail every later splat open in the
      // session with the same stale error. Clearing the slot lets the
      // next open retry the fetch.
      sparkModulePromise = null
      throw importError
    })
  }
  return sparkModulePromise
}


/**
 * Loader for Gaussian splat formats, conforming to the async
 * `parse(ArrayBuffer)` shape `readModel` drives (like ShareIfcLoader,
 * unlike three's url-oriented Loader.load). Backed by Spark's
 * `SplatMesh`, which decodes the bytes off-thread and implements the
 * standard three `raycast()` — so Picker selection and PlaceMark
 * annotation raycasts work with no splat-specific pick path.
 *
 * @param {string} extension a key of SPARK_FILE_TYPE_BY_EXT
 * @return {object} loader with async parse(ArrayBuffer) → SplatMesh
 */
export function newSplatLoader(extension) {
  return {
    parse: async function(modelData) {
      const {SplatMesh} = await loadSpark()
      const fileBytes = modelData instanceof Uint8Array ? modelData : new Uint8Array(modelData)
      // fileType undefined lets spark sniff the bytes (e.g. an
      // extension-less upload content-typed by Filetype's magic checks
      // would still land here with a known extension, but keep the
      // fallback for safety).
      const fileType = SPARK_FILE_TYPE_BY_EXT[extension]
      const mesh = new SplatMesh({fileBytes, fileType})
      // SplatMesh construction is sync; decode readiness is exposed as
      // a promise. Await it so parse errors (corrupt file, wrong
      // format) reject here and surface through load()'s normal error
      // path instead of as a blank scene.
      await mesh.initialized
      return mesh
    },
  }
}


/**
 * Fixup callback wrapping a decoded SplatMesh into the Group shape
 * convertToShareModel expects (matches stlToThree/xyzToThree).
 *
 * Three splat-specific adaptations:
 * - orientation: 3DGS training data uses the COLMAP/OpenCV y-down
 *   convention, so rotate π about X into three's y-up world (same
 *   correction spark's own examples apply).
 * - bounds: SplatMesh is geometry-less (splat data lives in textures;
 *   SparkRenderer draws it), so `Box3.setFromObject` — the basis of
 *   fit-to-frame, camera limits and shadow fitting — would see an
 *   empty box. Stash a bounds-proxy BoxGeometry on the root Group:
 *   `Box3.expandByObject` reads `.geometry.boundingBox` off any
 *   Object3D, and a Group is never rendered or raycast, so the proxy
 *   contributes bounds and nothing else. It also satisfies
 *   readModel's `model.geometry` hoist.
 * - rendering: splats draw through a scene-level SparkRenderer, added
 *   here once per scene (it must not live inside the model group —
 *   it's a Mesh, and its internal quad would pollute the model's
 *   bounds).
 *
 * @param {object} mesh spark SplatMesh from newSplatLoader#parse
 * @param {object} viewer used to reach the scene + renderer
 * @return {Group}
 */
export default function splatsToThree(mesh, viewer) {
  const root = new Group()
  mesh.name = 'Gaussian splats'
  mesh.modelID = 0
  mesh.rotation.x = Math.PI
  mesh.updateMatrix()
  root.add(mesh)
  root.mesh = mesh
  try {
    const bounds = mesh.getBoundingBox().applyMatrix4(mesh.matrix)
    if (!bounds.isEmpty()) {
      const proxy = new BoxGeometry(
        Math.max(bounds.max.x - bounds.min.x, Number.EPSILON),
        Math.max(bounds.max.y - bounds.min.y, Number.EPSILON),
        Math.max(bounds.max.z - bounds.min.z, Number.EPSILON),
      )
      proxy.translate(
        (bounds.min.x + bounds.max.x) / 2,
        (bounds.min.y + bounds.max.y) / 2,
        (bounds.min.z + bounds.max.z) / 2,
      )
      proxy.computeBoundingBox()
      root.geometry = proxy
    }
  } catch (e) {
    // Framing degrades to defaults; the model still renders.
    debug().warn('splatsToThree: could not compute splat bounds:', e)
  }
  ensureSparkRenderer(viewer)
  return root
}


/**
 * Add a SparkRenderer to the viewer's scene if it doesn't already have
 * one. SparkRenderer is the scene object that actually accumulates and
 * draws every SplatMesh each frame (SplatMesh alone renders nothing);
 * one per scene serves all splat models, and it hooks the existing rAF
 * loop via onBeforeRender — no render-loop changes needed. No-op in
 * renderer-less contexts (jsdom tests).
 *
 * @param {object} viewer
 */
function ensureSparkRenderer(viewer) {
  const renderer = viewer?.context?.getRenderer?.()
  const scene = viewer?.context?.getScene?.()
  if (!renderer || !scene || spark === null) {
    return
  }
  if (scene.children.some((child) => child instanceof spark.SparkRenderer)) {
    return
  }
  scene.add(new spark.SparkRenderer({renderer}))
}

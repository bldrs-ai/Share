import {Group} from 'three'
import {ADFLoader} from './adf/ADFLoader'
import {asList, i32, parseADF} from './adf/adf-parser'
import {MESH_KIND_CROWN} from './adf/mesh-sidecar'
import {meshPayloadFromCompressedData} from './mts/container'
import {decodeMesh} from './mts/decoder'
import debug from '../utils/debug'


/**
 * Align Technology ClinCheck `.adf` dental scans.
 *
 * The parser and three.js loader under `./adf/` are vendored from
 * pablo-mayrgundter/freality `bio/med/dental/src/` (see `./adf/README.md`).
 * This module is the Share-side adapter: it fits that loader to the
 * `findLoader` tuple, decodes the real crown surfaces, and trims what the
 * loader returns down to a renderable Group.
 *
 * Each tooth's crown is a MetaStream progressive mesh inside the ADF.
 * `./mts/` decodes it (design/new/adf-mts-decoder.md) and the results go to
 * the vendored loader as parsed `*.meshes.bin` entries through its
 * `ADFLoader#parse(buffer, {meshes})` option, so upstream needs no change.
 * A tooth whose stream fails to decode keeps upstream's parametric proxy.
 */


/**
 * `readModel` calls `loader.parse(modelData, basePath)`, but
 * `ADFLoader#parse`'s second argument is an options bag (`{meshes}`), so a
 * basePath string must not reach it.
 *
 * @return {{parse: function(ArrayBuffer): object}}
 */
export function newAdfLoader() {
  const adfLoader = new ADFLoader()
  return {
    parse: (buffer) => adfLoader.parse(buffer, {meshes: decodeCrowns(buffer).meshes}),
  }
}


/**
 * Decode every tooth's crown surface in an ADF.
 *
 * The ADF is parsed here and again inside `ADFLoader#parse`; that costs a
 * few milliseconds, against a vendored loader left exactly as upstream has it.
 *
 * @param {ArrayBuffer|Uint8Array} buffer the .adf file
 * @return {{meshes: Array<object>, failures: Array<{toothId: number, error: Error}>}}
 *   `meshes` in `*.meshes.bin` entry shape (`mesh-sidecar.js`): positions in
 *   metres, faces wound outward
 */
export function decodeCrowns(buffer) {
  const {root} = parseADF(buffer)
  const jawPair = root.JawPair && root.JawPair.__type === 'object' ? root.JawPair : root
  const meshes = []
  const failures = []
  for (const jaw of [jawPair.upper, jawPair.lower]) {
    if (!jaw) {
      continue
    }
    for (const tooth of asList(jaw.Tooth)) {
      if (!tooth || tooth.__type !== 'object') {
        continue
      }
      const toothId = i32(tooth.id)
      const blob = asList(tooth.CompressedQedge).map((q) => q?.CompressedData?.bytes).find((b) => b)
      if (!blob) {
        continue
      }
      try {
        const {positions, indices} = decodeMesh(meshPayloadFromCompressedData(blob))
        meshes.push({toothId, kind: MESH_KIND_CROWN, positions, indices: windOutward(positions, indices)})
      } catch (error) {
        failures.push({toothId, error})
      }
    }
  }
  if (failures.length) {
    debug().warn(`ADF: ${failures.length} crown(s) failed to decode and are drawn as proxies:`,
      failures.map((f) => `${f.toothId}: ${f.error.message}`))
  }
  return {meshes, failures}
}


/**
 * A MetaStream mesh can come out wound either way. Reverse every face when
 * the signed volume is negative, as freality's `build_meshes.py` does, so
 * three.js's front faces and computed normals point out of the tooth.
 *
 * @param {Float32Array} p
 * @param {Uint32Array} indices
 * @return {Uint32Array}
 */
function windOutward(p, indices) {
  let volume = 0
  for (let i = 0; i < indices.length; i += 3) {
    const a = 3 * indices[i]
    const b = 3 * indices[i + 1]
    const c = 3 * indices[i + 2]
    volume += (p[a] * ((p[b + 1] * p[c + 2]) - (p[b + 2] * p[c + 1]))) -
      (p[a + 1] * ((p[b] * p[c + 2]) - (p[b + 2] * p[c]))) +
      (p[a + 2] * ((p[b] * p[c + 1]) - (p[b + 1] * p[c])))
  }
  if (volume >= 0) {
    return indices
  }
  const flipped = new Uint32Array(indices.length)
  for (let i = 0; i < indices.length; i += 3) {
    flipped[i] = indices[i + 2]
    flipped[i + 1] = indices[i + 1]
    flipped[i + 2] = indices[i]
  }
  return flipped
}


/**
 * @param {object} result from `ADFLoader#parse`: `group` is the root Group,
 *   `jaws.upper` / `jaws.lower` its jaw Groups (either may be absent)
 * @return {Group}
 */
export default function adfToThree(result) {
  const {group, jaws} = result
  for (const jaw of Object.values(jaws)) {
    // ADF encodes spaces as '+' in names ("Upper+Jaw"); the NavTree shows these.
    jaw.name = jaw.name.replace(/\+/g, ' ')
    // Only the teeth show by default. The upstream viewer also shows the
    // `facc` group: each tooth's FACC axis and its landmark curves (incisal
    // ridge, cusps, grooves). Those polylines lie exactly on the crown
    // surface, so they z-fight into dashed lines that read as mesh seams
    // in a general viewer. The gingiva splines, interproximal sample points
    // and mesh bounding boxes are off upstream too.
    //
    // Hiding isn't enough for picking: three's Raycaster ignores `visible`,
    // and Picker#castRay intersects the whole scene. The curves sit on the
    // crown surface, and Line/Points hit within 1 world unit, so a hidden
    // curve would win a double-click over the crown under it.
    for (const key of ['facc', 'gingiva', 'scanPoints', 'meshBounds']) {
      const overlay = jaw.userData[key]
      overlay.visible = false
      overlay.traverse((obj) => {
        obj.raycast = noRaycast
      })
    }
    // Back-references kept for the upstream viewer's HUD. `teeth` holds every
    // tooth record (all its point arrays) plus its own Group and Mesh, and
    // JSON.stringify calls Object3D#toJSON on those. So anything that
    // stringifies userData, like GLTFExporter writing node `extras`, would
    // embed ~2MB of duplicated geometry per jaw.
    for (const key of ['teeth', 'facc', 'scanPoints', 'meshBounds', 'gingiva']) {
      delete jaw.userData[key]
    }
  }
  return group
}


/** A `raycast` that never hits, for overlays that must not be picked. */
function noRaycast() {
  // Intentionally empty: adds no intersections.
}

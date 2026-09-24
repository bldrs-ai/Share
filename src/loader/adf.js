import {Group} from 'three'
import {ADFLoader} from './adf/ADFLoader'


/**
 * Align Technology ClinCheck `.adf` dental scans.
 *
 * The parser and three.js loader under `./adf/` are vendored from
 * pablo-mayrgundter/freality `bio/med/dental/src/` (see `./adf/README.md`).
 * This module is the Share-side adapter: it fits that loader to the
 * `findLoader` tuple and trims what it returns down to a renderable Group.
 *
 * Crowns are drawn as parametric proxies posed from each tooth's FACC frame.
 * The real crown surfaces are MetaStream progressive meshes that no browser
 * code decodes yet. Upstream draws them from an offline-decoded
 * `*.meshes.bin` sidecar (`ADFLoader#parse(buffer, {meshes})`), but a
 * single-file load here doesn't fetch sibling files, so no sidecar is passed.
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
    parse: (buffer) => adfLoader.parse(buffer),
  }
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
    // Match the upstream viewer's defaults: teeth and FACC curves on; gingiva
    // splines, interproximal sample points and mesh bounding boxes off.
    jaw.userData.gingiva.visible = false
    jaw.userData.scanPoints.visible = false
    jaw.userData.meshBounds.visible = false
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

/**
 * What Share can export, and where each format's bytes come from.
 *
 * `source` is the load-bearing field:
 *  - `artifact` — derived from the cached GLB Share already wrote to OPFS.
 *    Dependency-free, no re-parse, and the module can be a plain-JS pro
 *    module (design/new/glb-export-premium.md §6.1).
 *  - `scene` — derived from the live three.js `Object3D`. three's example
 *    exporters import `three`, so those modules need the host to supply the
 *    namespace rather than bundling a second copy; that is what §6.1's shim
 *    prototype has to settle before any of them ships.
 *
 * `planned` rows are here rather than in a doc because the UI reads this
 * list: an "and soon" affordance built from a filtered array can't drift
 * from what actually ships. The feature matrix behind each row (what
 * survives the conversion) is doc §6.2.
 */

export const EXPORT_FORMATS = [
  {
    id: 'glb',
    label: 'GLB',
    ext: 'glb',
    mime: 'model/gltf-binary',
    moduleName: 'glbExport',
    source: 'artifact',
    status: 'shipped',
  },
  {
    id: 'obj',
    label: 'OBJ',
    ext: 'obj',
    mime: 'model/obj',
    moduleName: 'objExport',
    source: 'scene',
    status: 'planned',
  },
  {
    id: 'stl',
    label: 'STL',
    ext: 'stl',
    mime: 'model/stl',
    moduleName: 'stlExport',
    source: 'scene',
    status: 'planned',
  },
  {
    id: 'ply',
    label: 'PLY',
    ext: 'ply',
    mime: 'application/octet-stream',
    moduleName: 'plyExport',
    source: 'scene',
    status: 'planned',
  },
  {
    id: 'usdz',
    label: 'USDZ',
    ext: 'usdz',
    mime: 'model/vnd.usdz+zip',
    moduleName: 'usdzExport',
    source: 'scene',
    status: 'planned',
  },
  {
    id: '3mf',
    label: '3MF',
    ext: '3mf',
    mime: 'model/3mf',
    moduleName: 'threeMfExport',
    source: 'scene',
    status: 'planned',
  },
]


/**
 * @param {string} id Format id, e.g. 'glb'
 * @return {object|undefined} the registry row
 */
export function getExportFormat(id) {
  return EXPORT_FORMATS.find((f) => f.id === id)
}


/**
 * @return {Array<object>} the formats a user can actually export today
 */
export function shippedExportFormats() {
  return EXPORT_FORMATS.filter((f) => f.status === 'shipped')
}

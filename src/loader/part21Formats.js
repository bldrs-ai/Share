// The loader types (`loader.type`, Loader.js#findLoader) whose model Conway
// parses: ISO-10303-21 part-21 files. ONE list for every place that asks
// (AGENTS.md "IFC and STEP converge"): Loader.js (the store-open and
// truncation sniffs), modelArchive.js (what a `.ifczip` may hold),
// ShareModel.js (the IFC-like capabilities) and engine/engineModelLoad.js
// (which loads run in an engine worker).
//
// Each type maps to the Conway format it names, `'ifc'` or `'step'`. That is
// what the SUFFIX says, never evidence of the schema: only FILE_SCHEMA tells
// IFC from STEP, and conway reads it from the bytes. So the mapped format is
// a label for logs and reports; what a load does is decided from the bytes
// (Loader.js#canOpenFromStore, conway's own detector).
//
// Worker-safe: no imports, so the engine worker bundle can take it.


/** loader type → the Conway format its suffix names. */
const PART21_FORMAT_BY_LOADER_TYPE = Object.freeze({
  ifc: 'ifc',
  step: 'step',
  stp: 'step',
})


/** The part-21 loader types: `ifc`, `step`, `stp`. */
export const PART21_LOADER_TYPES = Object.freeze(new Set(Object.keys(PART21_FORMAT_BY_LOADER_TYPE)))


/**
 * The Conway format a loader type's suffix names, for a load a Conway engine
 * parses. `.ifczip` counts as `'ifc'`: it is not part-21 itself (an archive,
 * unwrapped to its entry by Loader#load before the parse), but a caller that
 * asks before the unwrap gets the answer one after would.
 *
 * @param {string|undefined} loaderType
 * @return {'ifc'|'step'|null} null for a format no Conway engine parses (GLB,
 *   OBJ, …: they stay on the main thread, engine-worker.md §2.3)
 */
export function engineFormatOf(loaderType) {
  if (loaderType === 'ifczip') {
    return 'ifc'
  }
  return Object.hasOwn(PART21_FORMAT_BY_LOADER_TYPE, loaderType ?? '') ?
    PART21_FORMAT_BY_LOADER_TYPE[loaderType] : null
}

// The georeferenced frame contract: how a rendered point maps back to the
// coordinates a model's file actually declares.
//
// This module is the ONE place that contract is written. Four subsystems
// touch the frame and each imports from here rather than restating it:
//
//   - `ShareIfcLoader#stampAppliedCoordination` reads the frame off the
//     engine and stamps it on a freshly parsed model;
//   - `loader/glbExport.js` carries the stamp into the GLB cache artifact;
//   - `loader/Loader.js#convertToShareModel` re-validates it coming back
//     out of that artifact (the cache file is an untrusted boundary);
//   - `IncrementalBatchedBuilder` / `coordinationOffsetFor` own the OTHER
//     half of the mapping and point here for how the two compose.
//
// ## The two surfaces (Share#1633 item 1, Share#1634)
//
// Two frames can sit between a file's authored coordinates and what the GPU
// draws. Until the `appliedCoordination` stamp Share reported only the
// second — which since the conway#680 fix chain landed (conway#685, pinned
// by Share#1816) essentially never fires, leaving a georeferenced model with
// no world-frame handle at all:
//
//  1. `userData.appliedCoordination` — `A`, the frame CONWAY composed into
//     every `flatTransformation` it emitted, from conway#702's
//     `GetAppliedCoordinationMatrix`. This is the normal case: the engine
//     does the georeferenced recentre itself, so this is where a Swiss LV95
//     model's offset actually lives — the ~2.6e6 m scale Share#1816
//     measured on Ecobau.
//  2. `userData.coordinationOffset` — `[x, y, z]`, SHARE's own backstop
//     recentre, stamped by `IncrementalBatchedBuilder` only when a placement
//     still arrives beyond `LARGE_COORD_THRESHOLD` *after* the engine has
//     had its turn (`decideCoordinationOffset`, Share#1632). Absent on a
//     healthy load.
//
// TOTAL render-frame mapping is the composition — Share's offset applied
// OUTSIDE the engine's frame, because the backstop subtracts from placements
// the engine had already composed under `A`:
//
//     rendered = (A * world) - coordinationOffset
//     world    = inverse(A) * (rendered + coordinationOffset)
//
// with `coordinationOffset` read as `[0, 0, 0]` when absent. On a healthy
// load that degenerates to conway's own `world = inverse(A) * rendered`.
//
// ## The engine's contract, verbatim from conway's doc comment
//
// (`compat/web-ifc/ifc_api.ts#GetAppliedCoordinationMatrix` — read it before
// changing anything here; only the fenced blocks are quoted.)
//
// > Every `flatTransformation` the model emits was composed as
// >
// >     flatTransformation = A * placement [ * translate(geomCentre) ]
// >
// > So for any vertex `v` a consumer uploads and renders,
// >
// >     rendered = flatTransformation * v = A * world
// >     world    = inverse(A) * rendered            <- the inverse you want
// >
// > `A` carries all three factors the recentre composed, in this order:
// >
// >     A = scale(linearScalingFactor) * NormalizeMat * translate(-anchor)
//
// `world` is the point in the model's AUTHORED world space — the file's own
// coordinates, in the file's units, Z-up. Inverting `A` is the whole of it:
// it undoes the unit scale and the Z-up->Y-up change of basis as well as the
// offset, so nothing else about the model is needed.
//
// Two clauses of that contract are easy to get wrong, and both are quoted
// here because a consumer of the stamp will hit them:
//
//  - `A` is identity ONLY when nothing was composed AND nothing was supplied
//    (an open without COORDINATE_TO_ORIGIN, a suppressed shard, a model that
//    emitted no geometry). Identity never means "ask again later".
//  - A near-origin model under COORDINATE_TO_ORIGIN returns a frame whose
//    TRANSLATION is exactly zero — no recentre was needed — but whose
//    rotation and scale are still live. DO NOT shortcut on "no offset
//    applied"; invert the matrix. That is why the stamp is unconditional
//    rather than elided when the translation is zero.
//
// ## Why a plain Array, and why the key is not `bldrs`-prefixed
//
// The frame is a plain `Array<number>` (JS numbers are float64, so this IS
// the float64 mat4 the contract asks for) and never a `Float64Array`, because
// it has to cross the GLB cache as JSON: the writer stamps it into the glTF
// JSON chunk under `scenes[0].extras`, and a typed array serialises there as
// `{"0": …, "1": …}` and never comes back a matrix.
//
// Note WHERE it crosses, because it is not where you would guess. It does NOT
// ride on the model's own `userData` via `GLTFExporter`: both cache writers
// drop userData — the batched-native writer builds a fresh gltf-transform
// Document, and the merged bake (`batchedToMergedMesh`) copies only matrix and
// name — so a stamp left on the model reaches the artifact on NEITHER path.
// It travels as scene extras, injected downstream of both writers on the
// packed bytes (`glbExport.js`), which is what makes one capture cover every
// layout.
//
// `APPLIED_COORDINATION_KEY` is deliberately un-prefixed, unlike the
// neighbouring `bldrsTitle` extras key. three.js GLTFLoader auto-promotes
// `scenes[0].extras` onto `scene.userData` VERBATIM, so the extras key IS
// the userData key — and it has to be the same name a fresh parse stamps, or
// a cache hit would present a second, differently-named surface and defeat
// the whole point of the issue. Keep it disjoint from other extras callers
// (see `injectGlbExtensions`'s last-write-wins note).
//
// The batched cache-hit path adds one more hop: `hydrateBatchedModelFromInstancedGlb`
// swaps the GLTFLoader scene for a rebuilt BatchedMesh model and merges the
// scene's userData onto it, so the frame survives that swap too. Both hops
// are pinned end to end in `loader/glbBatchedRoundTrip.test.js`.


/** A column-major mat4 has exactly this many elements. */
export const MAT4_LENGTH = 16


/**
 * The key the frame lives under, on `Object3D.userData` after a fresh parse
 * and inside `scenes[0].extras` in a GLB cache artifact. One constant, so
 * writer and reader can never drift apart. See the module header for why it
 * carries no `bldrs` prefix.
 */
export const APPLIED_COORDINATION_KEY = 'appliedCoordination'


/**
 * The value as a usable frame, or null when it is not one.
 *
 * Used at three boundaries, all of which need the same answer: the engine
 * reply (an older or non-conway engine can answer anything), the cache write
 * (never persist a frame that would read back wrong), and the cache read
 * (per `Loader.js`'s cached-title note, a GLB artifact is an untrusted
 * boundary in the originator-share design — a hand-edited file could carry
 * any JSON under this key).
 *
 * Length alone is not enough. `Matrix4#fromArray` reads 16 slots whatever
 * they hold, so an array of the right length full of `null` / `undefined` /
 * `NaN` — which JSON round-trips produce readily, `undefined` becoming
 * `null` — would silently become a garbage matrix in every consumer, and an
 * inverse of it is `NaN` everywhere. Refusing outright leaves the model with
 * NO frame, which a consumer can detect; a wrong frame it cannot.
 *
 * Returns a fresh copy rather than the input, so a caller can hand it to a
 * model without the source (an engine buffer, a parsed JSON blob) staying
 * able to mutate it.
 *
 * @param {*} value candidate frame
 * @return {?Array<number>} a fresh 16-element column-major mat4, or null
 */
export function validAppliedCoordination(value) {
  if (!Array.isArray(value) || value.length !== MAT4_LENGTH) {
    return null
  }
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return null
  }
  return Array.from(value)
}

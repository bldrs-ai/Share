import {parseGlb, serializeGlb} from './injectGlbExtensions'


/**
 * glbSlim — shrink a GLB's JSON chunk without touching a byte of geometry
 * (Share#1862).
 *
 * The batched writer's artifacts are overwhelmingly *declaration*. Measured
 * on a real `DSA2.step` artifact with `tools/glb/byteBudget.mjs`: 23,194,200 B
 * total, of which `json.chunk` is 20,630,338 B (88.95%) against 2,408,616 B of
 * geometry — 28,674 nodes, each one instance at an identity transform over its
 * own 3-vertex shape, so ~714 B of bookkeeping describes ~84 B of triangle.
 *
 * Three edits, in the order they are applied. All of them are pure
 * re-expressions: the same glTF, spelled shorter.
 *
 * 1. **One bufferView per `(buffer, target, byteStride)` class.**
 *    gltf-transform's default `VertexLayout.INTERLEAVED` emits one bufferView
 *    per mesh holding that mesh's POSITION+NORMAL at `byteStride: 24`, so the
 *    view count tracks the mesh count: 28,679 views, 2,313,763 B of JSON.
 *    `VertexLayout.SEPARATE` is worse (two per mesh, measured), and the
 *    library exposes no cross-mesh packing knob — hence a pass over its
 *    output rather than a setting. Accessors are rebased onto the merged
 *    view, which is legal because nothing in glTF requires an accessor's
 *    `byteOffset` to be smaller than the view's `byteStride`; Khronos
 *    `gltf-validator` reports 0 errors and 0 warnings on the result, an issue
 *    profile identical to the input's.
 *
 * 2. **Fields that restate a glTF default** — `primitives[].mode === 4`
 *    (TRIANGLES) and `byteOffset === 0`, both of which gltf-transform writes
 *    out explicitly.
 *
 * 3. **`accessors[].min`/`max` at shortest float32 round-trip precision.**
 *    A `Float32Array` element read into JS is a double holding the float32's
 *    exact value, so `JSON.stringify` spells 1.1 as `1.100000023841858`. The
 *    shortest decimal that `Math.fround`s back to the *identical* float32 is
 *    the same number, not a rounded one — min/max stay the true bounds the
 *    spec demands. Worth 1,173,173 B on the DSA2 shape.
 *
 * What this does NOT do: reduce the accessor *count*. 86,025 accessors for
 * 28,674 independently addressable meshes is what that mesh structure costs,
 * and collapsing the meshes would move per-node identity into index ranges —
 * a change reaching `BLDRS_face_ids`, picking and the portable rewrite. See
 * `design/new/glb-export-premium.md` §1.1c.
 *
 * Measured end to end on synthetic proxies of the two real shapes, through
 * the real writer: DSA2-shaped 22,750,376 → 19,083,044 B (−16.12%),
 * Snowdon-shaped 44,382,356 → 42,743,736 B (−3.69%), both 3 bufferViews out,
 * and zero accessors addressing different bytes than before.
 *
 * Runs before `injectGlbExtensions`, never after: that pass appends
 * `BLDRS_*` payload views of its own, and those are not ours to move.
 */


/** glTF `componentType` for 32-bit float. */
const COMPONENT_TYPE_FLOAT = 5126
/** glTF `primitive.mode` default — TRIANGLES. */
const PRIMITIVE_MODE_TRIANGLES = 4
/** No float32 needs more than 9 significant decimal digits to round-trip. */
const FLOAT32_MAX_SIGNIFICANT_DIGITS = 9
/** GLB alignment: every chunk, view and accessor offset sits on 4 bytes. */
const ALIGN = 4


/**
 * Round a byte length up to the next multiple of 4.
 *
 * @param {number} n
 * @return {number}
 */
function pad4(n) {
  return (n + ALIGN - 1) & ~(ALIGN - 1)
}


/**
 * The shortest decimal spelling that parses back to the SAME float32.
 *
 * Not an approximation: the returned number is `Math.fround`-equal to the
 * input, so an accessor bound written from it is bit-identical to the one
 * written from the long form. Values that are not exactly representable as
 * float32 (a min/max on a double-typed accessor, an integer bound) are
 * returned untouched rather than quietly re-rounded.
 *
 * @param {number} value
 * @return {number} the same float32, spelled with fewer digits
 */
export function shortestFloat32(value) {
  if (!Number.isFinite(value) || Math.fround(value) !== value) {
    return value
  }
  for (let digits = 1; digits <= FLOAT32_MAX_SIGNIFICANT_DIGITS; digits++) {
    const candidate = Number(value.toPrecision(digits))
    if (Math.fround(candidate) === value) {
      return candidate
    }
  }
  return value
}


/**
 * Which bufferViews this pass is allowed to merge.
 *
 * Only views reached solely through `accessors[].bufferView` qualify. An
 * image's bufferView has no per-image byte offset — its data IS the view — so
 * merging one would corrupt it; a sparse accessor's index/value views and any
 * view carrying `extensions` (`EXT_meshopt_compression` writes there) are
 * likewise addressed as whole views by something that is not a plain accessor.
 * The batched writer emits none of these, so in practice every view is
 * movable; the rule exists so that pointing this pass at some other GLB
 * degrades to "fewer bytes saved" rather than "wrong file".
 *
 * @param {object} json glTF JSON
 * @return {Array<boolean>} indexed by bufferView
 */
function findMovableViews(json) {
  const views = json.bufferViews ?? []
  const movable = views.map((view) => !view.extensions && !view.extras)
  const pin = (index) => {
    if (Number.isInteger(index) && index < movable.length) {
      movable[index] = false
    }
  }
  for (const image of json.images ?? []) {
    pin(image.bufferView)
  }
  for (const accessor of json.accessors ?? []) {
    pin(accessor.sparse?.indices?.bufferView)
    pin(accessor.sparse?.values?.bufferView)
  }
  return movable
}


/**
 * Every object in the document that holds a `bufferView` index.
 *
 * The repack renames every view, so a reference it does not know how to
 * rewrite is a corrupted file, not a missed saving. Three places are
 * rewritten — `accessors[]`, a sparse accessor's index/value descriptors, and
 * `images[]` — and extensions add more: `KHR_draco_mesh_compression` puts one
 * on a primitive, `EXT_meshopt_compression` on the view itself. Rather than
 * enumerate extensions this pass has never seen, it walks for the key and
 * refuses the repack if anything turns up that is not on the list.
 *
 * @param {object} node any JSON value
 * @param {Array<object>} found accumulator
 * @return {Array<object>} every object carrying an integer `bufferView`
 */
function collectBufferViewHolders(node, found = []) {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectBufferViewHolders(item, found)
    }
    return found
  }
  if (!node || typeof node !== 'object') {
    return found
  }
  if (Number.isInteger(node.bufferView)) {
    found.push(node)
  }
  for (const value of Object.values(node)) {
    collectBufferViewHolders(value, found)
  }
  return found
}


/**
 * Merge every movable bufferView into one per `(buffer, target, byteStride)`
 * class, rewriting the BIN chunk to match.
 *
 * Mutates `json` in place and returns the new BIN. Views that are not movable
 * are copied through as their own views, so their `byteLength` still bounds
 * exactly the bytes their referent expects.
 *
 * @param {object} json glTF JSON, mutated
 * @param {Uint8Array|null} bin the source BIN chunk
 * @return {Uint8Array|null} the rebuilt BIN chunk
 */
function repackBufferViews(json, bin) {
  const views = json.bufferViews ?? []
  // A GLB carries exactly one buffer — the BIN chunk. More than one means
  // URI-backed buffers this pass cannot see, and rewriting offsets against
  // bytes it does not hold would corrupt them.
  if (!bin || views.length === 0 || (json.buffers ?? []).length > 1) {
    return bin
  }
  const known = new Set()
  for (const accessor of json.accessors ?? []) {
    known.add(accessor).add(accessor.sparse?.indices).add(accessor.sparse?.values)
  }
  for (const image of json.images ?? []) {
    known.add(image)
  }
  if (collectBufferViewHolders(json).some((holder) => !known.has(holder))) {
    return bin
  }
  // A view reaching past the BIN chunk has to stop the repack before it
  // starts. `bin.subarray` CLAMPS rather than throwing, so the copy below
  // would silently write a short prefix and leave the remainder zero, and the
  // merged view would still declare the full length — a structurally valid
  // GLB whose accessors read zeros in place of the data they name. Declining
  // leaves the malformed input exactly as malformed as it arrived, which is
  // the only honest option for a transform (Codex review on #1864).
  if (views.some((view) => {
    const start = view.byteOffset ?? 0
    return start < 0 || view.byteLength < 0 || start + view.byteLength > bin.byteLength
  })) {
    return bin
  }
  const movable = findMovableViews(json)
  const classOf = (view) => `${view.buffer ?? 0}|${view.target ?? ''}|${view.byteStride ?? ''}`

  // Lay the new buffer out one CLASS at a time, not one view at a time. A
  // single pass in source order would interleave classes, leaving each merged
  // view's byteLength spanning its neighbours' bytes — reads would still be
  // correct, since every accessor keeps its own offset, so this is invisible
  // to a byte-for-byte accessor check. It is not invisible to a consumer:
  // three's GLTFParser uploads a whole bufferView as one GPU buffer, so
  // overlapping views would upload the geometry once per class.
  const classKeys = []
  for (const [index, view] of views.entries()) {
    if (movable[index] && !classKeys.includes(classOf(view))) {
      classKeys.push(classOf(view))
    }
  }
  // `shift` is what an accessor's byteOffset gains by being rebased onto the
  // merged view.
  const plan = []
  const merged = []
  const remap = new Array(views.length)
  let cursor = 0
  for (const key of classKeys) {
    const start = cursor
    const target = merged.length
    let prototype = null
    for (const [index, view] of views.entries()) {
      if (!movable[index] || classOf(view) !== key) {
        continue
      }
      prototype = prototype ?? view
      plan.push({
        fromOffset: view.byteOffset ?? 0,
        byteLength: view.byteLength,
        toOffset: cursor,
      })
      remap[index] = {view: target, shift: cursor - start}
      // Pad between members so every rebased accessor offset stays 4-aligned,
      // which glTF requires of every component type we write.
      cursor += pad4(view.byteLength)
    }
    const view = {buffer: prototype.buffer ?? 0, byteOffset: start, byteLength: cursor - start}
    if (prototype.target !== undefined) {
      view.target = prototype.target
    }
    if (prototype.byteStride !== undefined) {
      view.byteStride = prototype.byteStride
    }
    merged.push(view)
  }
  for (const [index, view] of views.entries()) {
    if (movable[index]) {
      continue
    }
    plan.push({fromOffset: view.byteOffset ?? 0, byteLength: view.byteLength, toOffset: cursor})
    remap[index] = {view: merged.length, shift: 0}
    merged.push({...view, byteOffset: cursor, byteLength: view.byteLength})
    cursor += pad4(view.byteLength)
  }

  const out = new Uint8Array(cursor)
  for (const {fromOffset, byteLength, toOffset} of plan) {
    out.set(bin.subarray(fromOffset, fromOffset + byteLength), toOffset)
  }

  const rebase = (holder) => {
    const mapped = remap[holder.bufferView]
    holder.bufferView = mapped.view
    const offset = (holder.byteOffset ?? 0) + mapped.shift
    if (offset === 0) {
      delete holder.byteOffset
    } else {
      holder.byteOffset = offset
    }
  }
  for (const accessor of json.accessors ?? []) {
    if (Number.isInteger(accessor.bufferView)) {
      rebase(accessor)
    }
    // Pinned above, so `shift` is 0 — but the view INDEX still moved.
    if (Number.isInteger(accessor.sparse?.indices?.bufferView)) {
      rebase(accessor.sparse.indices)
    }
    if (Number.isInteger(accessor.sparse?.values?.bufferView)) {
      rebase(accessor.sparse.values)
    }
  }
  for (const image of json.images ?? []) {
    if (Number.isInteger(image.bufferView)) {
      rebase(image)
    }
  }
  for (const view of merged) {
    if (view.byteOffset === 0) {
      delete view.byteOffset
    }
  }
  json.bufferViews = merged
  // glTF requires buffers[0].byteLength to equal the BIN chunk's UNPADDED
  // data length, so it has to follow the repack.
  json.buffers = [{byteLength: out.byteLength}]
  return out
}


/**
 * Drop fields whose value is the glTF default, and shorten float bounds.
 *
 * @param {object} json glTF JSON, mutated
 */
function dropRedundantJson(json) {
  for (const accessor of json.accessors ?? []) {
    if (accessor.byteOffset === 0) {
      delete accessor.byteOffset
    }
    if (accessor.componentType !== COMPONENT_TYPE_FLOAT) {
      continue
    }
    for (const bound of ['min', 'max']) {
      if (Array.isArray(accessor[bound])) {
        accessor[bound] = accessor[bound].map(shortestFloat32)
      }
    }
  }
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.mode === PRIMITIVE_MODE_TRIANGLES) {
        delete primitive.mode
      }
    }
  }
}


/**
 * Re-express a GLB's JSON chunk more compactly, leaving every accessor
 * addressing byte-identical data.
 *
 * That last clause is the contract and it is exactly testable: read each
 * accessor's elements out of the input and out of the output and compare the
 * bytes. `glbSlim.test.js` does, against a deliberate mutation.
 *
 * @param {Uint8Array} bytes a GLB binary
 * @return {{bytes: Uint8Array, stats: object}} the slimmed GLB, plus
 *   `{bufferViewsBefore, bufferViewsAfter, bytesBefore, bytesAfter}`
 */
export function slimGlbBytes(bytes) {
  const {json, bin} = parseGlb(bytes)
  const bufferViewsBefore = (json.bufferViews ?? []).length
  const repacked = repackBufferViews(json, bin)
  dropRedundantJson(json)
  const out = serializeGlb(json, repacked)
  return {
    bytes: out,
    stats: {
      bufferViewsBefore,
      bufferViewsAfter: (json.bufferViews ?? []).length,
      bytesBefore: bytes.byteLength,
      bytesAfter: out.byteLength,
    },
  }
}

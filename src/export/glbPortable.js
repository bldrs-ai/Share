// Rewriting the batched-native artifact into a plain glTF scene graph, so
// the export opens — and reads — in viewers that are not Share.
//
// The export IS the cache artifact (design/new/glb-export-premium.md §1.1):
// one glTF mesh per unique geometry × source colour, every placement of it
// carried by `EXT_mesh_gpu_instancing`, and the element names and hierarchy
// living in the `BLDRS_spatial_tree` payload rather than in glTF nodes. That
// is the right shape for Share's own reader and the wrong shape for everyone
// else — 3dviewer.net REFUSES the file (the writer marks the extension
// `setRequired(true)`, `loader/glbBatchedExport.js`, and a required extension
// a reader does not implement is a hard stop per the glTF spec), and the
// three.js editor opens it as a flat list of `mesh_N` (#1843).
//
// This module expands that into what a generic viewer expects: one node per
// element, named and nested to mirror the spatial tree, each placement a
// child node with its own TRS referencing the SHARED mesh. Nodes may share a
// mesh, so nothing is duplicated except JSON — the geometry bufferViews are
// copied byte for byte.
//
// **Raw glTF JSON, not a `@gltf-transform` Document.** The house pattern for
// JSON-level surgery is already raw JSON (`glbArtifactSize.js#stripBldrsJson`,
// `glbStrip.js`): gltf-transform drops every extension its IO has not
// registered, so a Document round trip would re-pay the detach/re-inject
// dance `glbCompression.js` exists for and re-serialise the whole BIN. Raw
// JSON is also what makes "the geometry is byte-identical" provable rather
// than merely likely.
//
// **Ordering: portable → codec → strip.** Portable must run BEFORE the strip,
// which removes the very payloads it reads, and before any codec: under
// Meshopt a bufferView addresses DECODED bytes on a fallback buffer that is
// not in the file (`glbArtifactSize.js#meshoptCompressedRange`), and under
// Draco the instance TRS floats are not floats any more. `artifactSizes.js`
// owns that order.
//
// **What survives the round trip back into Share.** The nav tree and the
// Properties panel key off the root `BLDRS_*` extension entries and are
// indifferent to the node graph, so they come back intact. Picking does too,
// since #1849: every mesh-bearing node here is stamped with the `extras` that
// hydration needs (`bldrsTableNode` + `bldrsInstance`), and
// `instancedGlbToBatchedModel.js#joinPortableNodesToTables` reads them back
// into the same decorated BatchedMesh the batched-native artifact hydrates to
// — so keep the stamp. Without it a portable file is permanently
// un-hydratable and reopens as a plain, un-pickable and (on a colourless
// model) grey GLB, which is what it did before #1849.
//
// Design: design/new/glb-export-premium.md §4.3.
import {reifyName} from '@bldrs-ai/ifclib'
import * as pako from 'pako'
import {
  BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
  parseInstanceTablesExtensionData,
} from '../loader/bldrsInstanceTables'
import {BLDRS_SPATIAL_TREE_EXTENSION_NAME, validateDecodedTree} from '../loader/bldrsSpatialTree'
import {dropBufferViews, referencedBufferViews} from '../loader/glbArtifactSize'
import {parseGlb, repackGlbBin, serializeGlb} from '../loader/injectGlbExtensions'


/** The extension whose removal is the point of the exercise. */
export const INSTANCING_EXTENSION_NAME = 'EXT_mesh_gpu_instancing'

/** Where the instances of an element that the spatial tree does not name go. */
export const UNASSIGNED_NODE_NAME = 'Unassigned'

const GLTF_FLOAT = 5126
const BYTES_PER_FLOAT = 4
const COMPONENTS_BY_TYPE = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}
// Nine significant digits round-trip a float32 exactly (24 bits of mantissa
// need at most 9 decimal digits), so this shortens the JSON without changing
// a single placement. `JSON.stringify` would otherwise write the full
// double-precision expansion of each float32 — "1.2000000476837158" for a
// value the file stores as 1.2.
const TRS_SIGNIFICANT_DIGITS = 9
const IDENTITY_TRANSLATION = [0, 0, 0]
const IDENTITY_ROTATION = [0, 0, 0, 1]
const IDENTITY_SCALE = [1, 1, 1]
// `reifyName` resolves an element's type through `webIfc.properties.getIfcType`.
// A cache-hit model's is the identity (`Loader.js#convertToShareModel` sets
// `model.getIfcType = (eltType) => eltType`), and the spatial-tree payload
// stores exactly what that model would have returned — so this stub makes the
// naming here identical to the NavTree's for the same artifact.
const IFC_TYPE_IDENTITY = {properties: {getIfcType: (type) => type}}


/**
 * Whether this GLB is a batched-native artifact the rewrite understands.
 *
 * Two conditions, and both are needed. The extension has to be there or there
 * is nothing to expand — a merged-layout artifact, an already-portable file
 * and any third-party GLB all leave through here untouched. And every node
 * has to be one of OUR table nodes, because the rewrite replaces `json.nodes`
 * wholesale: a file with a node this module did not put there would lose it.
 *
 * @param {object} json Parsed glTF JSON
 * @return {boolean}
 */
export function isPortableRewritable(json) {
  if (!(json?.extensionsUsed || []).includes(INSTANCING_EXTENSION_NAME)) {
    return false
  }
  const nodes = json.nodes || []
  return nodes.length > 0 &&
    nodes.every((node) => Number.isInteger(node?.extras?.bldrsTableNode))
}


/**
 * Rewrite a batched-native GLB into a portable one.
 *
 * Returns the input untouched (`isChanged: false`) for anything that is not a
 * batched-native artifact, which is the same "nothing to do, so do nothing"
 * contract `stripGlbBldrs` has: re-serialising a file to byte-for-byte the
 * same content is a risk taken for no gain.
 *
 * @param {Uint8Array} glbBytes One standalone GLB (the artifact's chunk 0)
 * @return {{bytes: Uint8Array, isChanged: boolean, stats: object}} `stats` is
 *   `{elementNodes, instanceNodes, unassignedInstances}`, plus
 *   `{droppedAccessors, droppedBufferViews}` when the rewrite ran
 */
export function rewriteGlbPortable(glbBytes) {
  const {json, bin} = parseGlb(glbBytes)
  if (!isPortableRewritable(json)) {
    return {
      bytes: glbBytes,
      isChanged: false,
      stats: {elementNodes: 0, instanceNodes: 0, unassignedInstances: 0},
    }
  }

  const tables =
    readJsonPayload(json, bin, BLDRS_INSTANCE_TABLES_EXTENSION_NAME, parseInstanceTablesExtensionData)
  // The reader's own validator, not a pass-through: a tree from a future or
  // foreign schema names nothing this file's instances join to, and letting
  // it through would emit a hierarchy of nodes with garbage names beside an
  // `Unassigned` root holding every actual placement.
  const spatialTree =
    readJsonPayload(json, bin, BLDRS_SPATIAL_TREE_EXTENSION_NAME, validateDecodedTree)

  const instances = collectInstances(json, bin, tables)
  const {nodes, roots, stats} = buildPortableNodes(instances, spatialTree)

  const droppedAccessors = removeInstancingAccessors(json)
  json.nodes = nodes
  for (const scene of json.scenes || []) {
    scene.nodes = roots
  }
  dropExtensionName(json, INSTANCING_EXTENSION_NAME)

  // Reclaim the TRS accessors' bytes. 40 B per instance — 4 MB on a
  // 100k-instance model — and nothing downstream would prune them:
  // `@gltf-transform` keeps an orphaned bufferView, and the strip only ever
  // looks at `BLDRS_*` references.
  const orphans = orphanedBufferViews(json)
  const {binPlan, binByteLength} = dropBufferViews(json, orphans)

  const bytes = serializeGlb(json, repackGlbBin(bin, binPlan, binByteLength))
  return {
    bytes,
    isChanged: true,
    stats: {
      ...stats,
      droppedAccessors,
      droppedBufferViews: orphans.size,
    },
  }
}


/**
 * Every instance in the file, in table order, with the element key it joins
 * on.
 *
 * The join key is `parents[j]` — the parent IFC product's expressID
 * (`viewer/ifc/batchedSubset.js`) — refined by `occurrencePaths[j]` for STEP,
 * where one part type is reused at many occurrences and the scalar expressID
 * collides across all of them. NOT `occurrenceIds`, which is a global
 * emission-order index (`viewer/ifc/batchedHighlight.js`) and joins to
 * nothing in the tree.
 *
 * A table that cannot be read at all leaves every instance unkeyed rather
 * than failing the export: the user still gets a portable file, with its
 * placements under `Unassigned`. Losing the names is a smaller harm than
 * losing the file.
 *
 * @param {object} json Parsed glTF JSON
 * @param {?Uint8Array} bin Its BIN chunk
 * @param {?Array<object>} tables Parsed `BLDRS_instance_tables` nodes
 * @return {Array<object>} `{key, mesh, tableNode, instance, translation,
 *   rotation, scale}`, one per instance
 */
function collectInstances(json, bin, tables) {
  const instances = []
  for (const node of json.nodes) {
    const tableIndex = node.extras.bldrsTableNode
    const attributes = node.extensions?.[INSTANCING_EXTENSION_NAME]?.attributes
    if (!attributes) {
      continue
    }
    const translation = readFloatAccessor(json, bin, attributes.TRANSLATION, COMPONENTS_BY_TYPE.VEC3)
    const rotation = readFloatAccessor(json, bin, attributes.ROTATION, COMPONENTS_BY_TYPE.VEC4)
    const scale = readFloatAccessor(json, bin, attributes.SCALE, COMPONENTS_BY_TYPE.VEC3)
    const count = json.accessors?.[attributes.TRANSLATION]?.count ?? 0
    const table = tables?.[tableIndex] ?? null
    // The same integrity check the reader makes before it trusts a table
    // against its InstancedMesh (`instancedGlbToBatchedModel.js`): a table
    // whose count disagrees with the accessor describes a different file.
    // Drop the table rather than the instances — the placements are still
    // real, they just lose their names.
    const keyed = table && table.count === count ? table : null
    for (let j = 0; j < count; j++) {
      instances.push({
        key: keyed ? elementKeyOf(keyed.parents[j], keyed.occurrencePaths?.[j]) : null,
        mesh: node.mesh,
        tableNode: tableIndex,
        instance: j,
        translation: translation ? sliceVec(translation, j, COMPONENTS_BY_TYPE.VEC3) : IDENTITY_TRANSLATION,
        rotation: rotation ? sliceVec(rotation, j, COMPONENTS_BY_TYPE.VEC4) : IDENTITY_ROTATION,
        scale: scale ? sliceVec(scale, j, COMPONENTS_BY_TYPE.VEC3) : IDENTITY_SCALE,
      })
    }
  }
  return instances
}


/**
 * The scene graph: the spatial tree reproduced as named nodes, with each
 * element's instances hanging off the node that names them.
 *
 * A tree node with exactly one instance and no children carries the mesh and
 * the TRS itself — the common case for a building element, and the one that
 * decides whether a viewer's outliner reads as a model or as a model with a
 * spurious extra level under every leaf. Anything else keeps the element node
 * transform-free and gives each placement its own child, because a TRS on a
 * node with children would move the children too.
 *
 * The walk below is unguarded, and can be: the tree is `JSON.parse` output
 * from the file's own payload, so it cannot cycle, and its depth is whatever
 * `bldrsSpatialTree.js#serializeNode` let through `MAX_TREE_DEPTH` at capture.
 *
 * @param {Array<object>} instances From `collectInstances`
 * @param {?object} spatialTree The `BLDRS_spatial_tree` payload's root node
 * @return {{nodes: Array<object>, roots: Array<number>, stats: object}}
 */
function buildPortableNodes(instances, spatialTree) {
  const byKey = new Map()
  for (const instance of instances) {
    if (instance.key === null) {
      continue
    }
    const bucket = byKey.get(instance.key)
    if (bucket) {
      bucket.push(instance)
    } else {
      byKey.set(instance.key, [instance])
    }
  }

  const nodes = []
  let elementNodes = 0

  /**
   * @param {object} treeNode A `BLDRS_spatial_tree` node
   * @return {number} the index of the glTF node emitted for it
   */
  const emit = (treeNode) => {
    const children = []
    for (const child of treeNode.children || []) {
      if (child && child.expressID !== undefined) {
        children.push(emit(child))
      }
    }
    const key = elementKeyOf(treeNode.expressID, treeNode.occurrencePath)
    const mine = byKey.get(key) || []
    // Consumed, so a tree that names the same key twice — a STEP part type
    // reused without an occurrence path to tell the copies apart — cannot
    // emit the same placement under both.
    byKey.delete(key)
    const node = {name: nodeNameOf(treeNode)}
    if (mine.length === 1 && children.length === 0) {
      applyInstance(node, mine[0])
    } else {
      for (const instance of mine) {
        const child = {name: `${node.name} #${instance.instance}`}
        applyInstance(child, instance)
        children.push(pushNode(nodes, child))
      }
    }
    if (children.length > 0) {
      node.children = children
    }
    elementNodes++
    return pushNode(nodes, node)
  }

  const roots = []
  if (spatialTree && spatialTree.expressID !== undefined) {
    roots.push(emit(spatialTree))
  }

  // Placements the tree does not account for: a STEP occurrence path the
  // capture truncated, an element below the tree's depth ceiling, or a file
  // whose tables could not be read at all. They are still geometry the user
  // exported and must appear, so they go under one synthetic node rather
  // than silently out of the scene.
  const orphaned = instances.filter(
    (instance) => instance.key === null || byKey.has(instance.key))
  if (orphaned.length > 0) {
    const children = orphaned.map((instance) => {
      const child = {name: instance.key === null ?
        `Instance #${instance.instance}` :
        `#${instance.key}`}
      applyInstance(child, instance)
      return pushNode(nodes, child)
    })
    roots.push(pushNode(nodes, {name: UNASSIGNED_NODE_NAME, children}))
  }

  return {
    nodes,
    roots,
    stats: {
      elementNodes,
      instanceNodes: instances.length,
      unassignedInstances: orphaned.length,
    },
  }
}


/**
 * Put one placement on a node: the shared mesh, the TRS, and the join keys a
 * portable re-hydration needs.
 *
 * Default TRS components are omitted — glTF defines the defaults, and a
 * `"scale":[1,1,1]` on every one of 100k nodes is 20 characters each of
 * saying nothing.
 *
 * @param {object} node The glTF node being built, mutated
 * @param {object} instance From `collectInstances`
 */
function applyInstance(node, instance) {
  node.mesh = instance.mesh
  if (!isDefaultTransform(instance.translation, IDENTITY_TRANSLATION)) {
    node.translation = roundFloats(instance.translation)
  }
  if (!isDefaultTransform(instance.rotation, IDENTITY_ROTATION)) {
    node.rotation = roundFloats(instance.rotation)
  }
  if (!isDefaultTransform(instance.scale, IDENTITY_SCALE)) {
    node.scale = roundFloats(instance.scale)
  }
  // Required, not a nicety: this pair is the only way back from a plain Mesh
  // to its row in `BLDRS_instance_tables` — the source colour, the parent
  // expressID, the STEP occurrence path. See the module doc.
  node.extras = {bldrsTableNode: instance.tableNode, bldrsInstance: instance.instance}
}


/**
 * @param {Array<object>} nodes Accumulator, mutated
 * @param {object} node
 * @return {number} the node's index
 */
function pushNode(nodes, node) {
  nodes.push(node)
  return nodes.length - 1
}


/**
 * The label the NavTree would give this element, so the two agree.
 *
 * `reifyName` prefers `LongName` over `Name` (`@bldrs-ai/ifclib`, and the
 * opposite order from #1843's phrasing) and falls back to a prettified type
 * name. That fallback is shared by every unnamed element of a type, so the
 * expressID is appended to it — the `<Kind> #<id>` convention
 * `utils/geometryLabels.js` already uses for anonymous geometry. There is no
 * GlobalId to use instead: `BLDRS_spatial_tree` does not carry one
 * (`loader/bldrsSpatialTree.js#serializeNode`), and the only place it lives
 * is `BLDRS_element_properties`, whose whole design is to inflate lazily per
 * block rather than open the entire pset closure.
 *
 * Every name here comes out of `reifyName`, including the fallback — nothing
 * is re-derived. `hasAuthoredName` answers only WHICH of its branches ran,
 * because the returned string does not say: an unnamed `IfcWall` and one
 * authored "Wall" both reify to "Wall", and only the second should keep that
 * name unadorned. **The result overrides that answer when it is blank.**
 * `reifyName` tests the RAW value for truth and trims afterwards, so an
 * element whose only name is whitespace takes the authored branch and then
 * reifies to `''` — several authoring tools emit a single-space
 * `IfcBuildingStorey.LongName`, and trusting the branch there would name the
 * node `" #4213"` instead of `Storey #4213`.
 *
 * @param {object} treeNode A `BLDRS_spatial_tree` node
 * @return {string}
 */
function nodeNameOf(treeNode) {
  const name = reifyName(IFC_TYPE_IDENTITY, treeNode)
  if (hasAuthoredName(treeNode) && name.trim() !== '') {
    return name
  }
  // `reifyName` on a name-less copy: the type fallback, which is the branch
  // it would NOT have taken for an element that has a name it cannot use.
  return `${reifyName(IFC_TYPE_IDENTITY, {type: treeNode.type})} #${treeNode.expressID}`
}


/**
 * Whether `reifyName` takes its authored-name branch for this node: the RAW
 * value's truthiness, with `LongName` short-circuiting a `Name` beside it
 * even when its own value is empty (`@bldrs-ai/ifclib/src/Ifc.js`) — the
 * NavTree shows the type fallback in that case, and so must this.
 *
 * Deliberately does NOT trim. Trimming here is what made this predicate
 * disagree with `reifyName` about a whitespace-only name; whether the branch
 * produced anything USABLE is the caller's check, on the result.
 *
 * @param {object} treeNode
 * @return {boolean}
 */
function hasAuthoredName(treeNode) {
  if (treeNode.LongName) {
    return Boolean(treeNode.LongName.value)
  }
  if (treeNode.Name) {
    return Boolean(treeNode.Name.value)
  }
  return false
}


/**
 * The key an instance and a tree node join on.
 *
 * @param {number} expressID Parent IFC product expressID
 * @param {?Array<number>} occurrencePath STEP NAUO chain, absent for IFC
 * @return {string|number}
 */
function elementKeyOf(expressID, occurrencePath) {
  return Array.isArray(occurrencePath) && occurrencePath.length > 0 ?
    occurrencePath.join('/') :
    expressID
}


/**
 * Remove the instancing extension's accessors and re-index what survives.
 *
 * They are referenced from nowhere else once the extension objects are gone,
 * and leaving them would keep their bufferViews alive — the 40 B/instance the
 * rewrite exists partly to reclaim. An accessor a mesh also uses is kept
 * (impossible for anything this writer emits; cheap to be right about).
 *
 * @param {object} json Parsed glTF JSON, mutated
 * @return {number} how many accessors were dropped
 */
function removeInstancingAccessors(json) {
  const candidates = new Set()
  for (const node of json.nodes || []) {
    const attributes = node.extensions?.[INSTANCING_EXTENSION_NAME]?.attributes || {}
    for (const index of Object.values(attributes)) {
      if (Number.isInteger(index)) {
        candidates.add(index)
      }
    }
  }
  if (candidates.size === 0) {
    return 0
  }
  // Every accessor reference outside the instancing extension. The glTF 2.0
  // core schema has exactly these sites; the artifact only ever uses the
  // first two, and the rest make the ACCESSOR re-indexing total at no cost.
  // The node-index half of the same problem is deliberately uncovered —
  // `json.nodes` is replaced wholesale below, which would leave
  // `skins[].joints` and `animations[].channels[].target.node` pointing at
  // the wrong nodes. Neither can occur: this writer emits no skin and no
  // animation, and `isPortableRewritable` refuses a file with a node it did
  // not write.
  const kept = new Set()
  const keep = (index) => Number.isInteger(index) && kept.add(index)
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      Object.values(primitive.attributes || {}).forEach(keep)
      keep(primitive.indices)
      for (const target of primitive.targets || []) {
        Object.values(target).forEach(keep)
      }
    }
  }
  for (const skin of json.skins || []) {
    keep(skin.inverseBindMatrices)
  }
  for (const animation of json.animations || []) {
    for (const sampler of animation.samplers || []) {
      keep(sampler.input)
      keep(sampler.output)
    }
  }

  const remap = new Map()
  const survivors = []
  for (let i = 0; i < (json.accessors || []).length; i++) {
    if (candidates.has(i) && !kept.has(i)) {
      continue
    }
    remap.set(i, survivors.length)
    survivors.push(json.accessors[i])
  }
  const dropped = json.accessors.length - survivors.length
  json.accessors = survivors
  // Same sites, now rewritten. `kept` was gathered from exactly these, so
  // every index here is in the remap.
  const remapOf = (index) => (Number.isInteger(index) ? remap.get(index) : index)
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      primitive.attributes = mapValues(primitive.attributes, remapOf)
      if (Number.isInteger(primitive.indices)) {
        primitive.indices = remap.get(primitive.indices)
      }
      if (Array.isArray(primitive.targets)) {
        primitive.targets = primitive.targets.map((target) => mapValues(target, remapOf))
      }
    }
  }
  for (const skin of json.skins || []) {
    if (Number.isInteger(skin.inverseBindMatrices)) {
      skin.inverseBindMatrices = remap.get(skin.inverseBindMatrices)
    }
  }
  for (const animation of json.animations || []) {
    for (const sampler of animation.samplers || []) {
      sampler.input = remapOf(sampler.input)
      sampler.output = remapOf(sampler.output)
    }
  }
  return dropped
}


/**
 * @param {object} object
 * @param {Function} fn
 * @return {object} a copy with every value mapped
 */
function mapValues(object, fn) {
  const out = {}
  for (const [key, value] of Object.entries(object || {})) {
    out[key] = fn(value)
  }
  return out
}


/**
 * Which bufferViews nothing references any more — the TRS accessors' views,
 * now that those accessors are gone.
 *
 * Computed from what IS referenced rather than from what was dropped: a view
 * shared between a dropped accessor and a surviving one must stay, and
 * asking "who still points here" answers that without a second bookkeeping
 * pass. `referencedBufferViews` is the same walk the strip classifies with,
 * so the two agree on what counts as a reference.
 *
 * @param {object} json Parsed glTF JSON, with the instancing accessors gone
 * @return {Set<number>} bufferView indices safe to drop
 */
function orphanedBufferViews(json) {
  const referenced = referencedBufferViews(json)
  const orphans = new Set()
  for (let i = 0; i < (json.bufferViews || []).length; i++) {
    if (!referenced.has(i)) {
      orphans.add(i)
    }
  }
  return orphans
}


/**
 * Remove an extension name from `extensionsUsed` AND `extensionsRequired`.
 *
 * Both, because the batched writer marks the instancing extension required
 * (`glbBatchedExport.js`) and it is the REQUIRED list that makes a viewer
 * refuse the file outright rather than degrade.
 *
 * @param {object} json Parsed glTF JSON, mutated
 * @param {string} name
 */
function dropExtensionName(json, name) {
  for (const field of ['extensionsUsed', 'extensionsRequired']) {
    if (!Array.isArray(json[field])) {
      continue
    }
    json[field] = json[field].filter((used) => used !== name)
    if (json[field].length === 0) {
      delete json[field]
    }
  }
}


/**
 * Decode one gzipped-JSON `BLDRS_*` root payload straight out of the BIN
 * chunk.
 *
 * The reader-side plugins do this through GLTFLoader's dependency graph,
 * which is not available here — this runs on bytes, not on a parse.
 *
 * @param {object} json Parsed glTF JSON
 * @param {?Uint8Array} bin Its BIN chunk
 * @param {string} name Extension name
 * @param {Function} validate Parses/validates the decoded object; returns null
 *   to reject
 * @return {?object} the payload, or null when absent or unreadable
 */
function readJsonPayload(json, bin, name, validate) {
  const entry = json.extensions?.[name]
  const view = json.bufferViews?.[entry?.bufferView]
  if (!bin || !view || !Number.isInteger(view.byteLength)) {
    return null
  }
  try {
    const at = view.byteOffset ?? 0
    const bytes = bin.subarray(at, at + view.byteLength)
    const text = entry.compressed ?
      pako.ungzip(bytes, {to: 'string'}) :
      new TextDecoder('utf-8').decode(bytes)
    return validate(JSON.parse(text))
  } catch {
    // A payload we cannot read costs names, not the export.
    return null
  }
}


/**
 * Read a float accessor into a flat `Float32Array`.
 *
 * `byteStride` is honoured: the instancing attributes are ordinary vertex-ish
 * accessors and an exporter is free to interleave or pad them, even though
 * ours writes them tightly packed.
 *
 * @param {object} json Parsed glTF JSON
 * @param {?Uint8Array} bin Its BIN chunk
 * @param {*} index Accessor index
 * @param {number} components Expected components per element
 * @return {?Float32Array}
 */
function readFloatAccessor(json, bin, index, components) {
  const accessor = json.accessors?.[index]
  if (!bin || !accessor || accessor.componentType !== GLTF_FLOAT ||
      COMPONENTS_BY_TYPE[accessor.type] !== components) {
    return null
  }
  const view = json.bufferViews?.[accessor.bufferView]
  if (!view || (view.buffer ?? 0) !== 0) {
    return null
  }
  const stride = view.byteStride || (components * BYTES_PER_FLOAT)
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const out = new Float32Array(accessor.count * components)
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < components; c++) {
      out[(i * components) + c] = dv.getFloat32(base + (i * stride) + (c * BYTES_PER_FLOAT), true)
    }
  }
  return out
}


/**
 * @param {Float32Array} floats
 * @param {number} i Element index
 * @param {number} components
 * @return {Array<number>}
 */
function sliceVec(floats, i, components) {
  return Array.from(floats.subarray(i * components, (i + 1) * components))
}


/**
 * @param {Array<number>} values
 * @param {Array<number>} identity
 * @return {boolean}
 */
function isDefaultTransform(values, identity) {
  return values.every((value, i) => value === identity[i])
}


/**
 * @param {Array<number>} values
 * @return {Array<number>} the same values at 9 significant digits
 */
function roundFloats(values) {
  return values.map((value) => Number(value.toPrecision(TRS_SIGNIFICANT_DIGITS)))
}

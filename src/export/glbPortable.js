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
// **Collapsed nodes (#1871) are split back into one mesh per element.** A
// collapsed artifact holds each colour's single-placement elements as ONE
// merged primitive, addressed by the ranges in `BLDRS_instance_tables` v2
// (glb-export-premium.md §1.1d). A third-party viewer would show that as one
// object per colour, so the rewrite slices it: each element gets POSITION /
// NORMAL accessors that are windows onto the merged vertex views (no bytes
// copied) and an index accessor onto its own slice of the merged index
// buffer. The one byte-level change is to those indices, which the writer
// stored ABSOLUTE (relative to the merged primitive) and a window onto the
// vertices needs LOCAL; they are rewritten in place, on a copy of the BIN, so
// nothing grows. Every element keeps the collapsed node's transform — the
// group offset its vertices are relative to.
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
import {shortestFloat32} from '../loader/glbSlim'
import {parseGlb, repackGlbBin, serializeGlb} from '../loader/injectGlbExtensions'


/** The extension whose removal is the point of the exercise. */
export const INSTANCING_EXTENSION_NAME = 'EXT_mesh_gpu_instancing'

/** Where the instances of an element that the spatial tree does not name go. */
export const UNASSIGNED_NODE_NAME = 'Unassigned'

const GLTF_FLOAT = 5126
const BYTES_PER_FLOAT = 4
const GLTF_UNSIGNED_BYTE = 5121
const GLTF_UNSIGNED_SHORT = 5123
const GLTF_UNSIGNED_INT = 5125
const UINT16_BYTES = 2
const UINT32_BYTES = 4
// Index component types a glTF primitive may use, and their byte widths.
const INDEX_COMPONENT_BYTES = {
  [GLTF_UNSIGNED_BYTE]: 1,
  [GLTF_UNSIGNED_SHORT]: UINT16_BYTES,
  [GLTF_UNSIGNED_INT]: UINT32_BYTES,
}
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
  const nodes = json?.nodes || []
  if (nodes.length === 0 ||
      !nodes.every((node) => Number.isInteger(node?.extras?.bldrsTableNode))) {
    return false
  }
  if ((json.extensionsUsed || []).includes(INSTANCING_EXTENSION_NAME)) {
    return true
  }
  // A FULLY collapsed artifact (#1871) uses no instancing at all — the writer
  // does not even declare the extension — yet is exactly as un-portable: one
  // merged mesh per colour. Its nodes are the only stamped, mesh-bearing
  // nodes without a `bldrsInstance` row, which is what marks a node this
  // rewrite already emitted.
  return nodes.every((node) =>
    Number.isInteger(node.mesh) && !Number.isInteger(node.extras.bldrsInstance))
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

  // A private copy, because splitting a collapsed node rewrites its index
  // bytes in place and the caller's buffer is not ours to change.
  const workingBin = bin ? bin.slice() : bin
  const splits = splitCollapsedNodes(json, workingBin, tables)
  const instances = collectInstances(json, workingBin, tables, splits)
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

  const bytes = serializeGlb(json, repackGlbBin(workingBin, binPlan, binByteLength))
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
 * A collapsed node contributes one instance per ROW, each on the per-element
 * mesh `splitCollapsedNodes` made for it and all at the node's own transform.
 * One that could not be split stays one placement of its merged mesh, keyed
 * to nothing: it renders right and lands under `Unassigned`, since a single
 * node cannot carry several elements' names.
 *
 * @param {object} json Parsed glTF JSON
 * @param {?Uint8Array} bin Its BIN chunk
 * @param {?Array<object>} tables Parsed `BLDRS_instance_tables` nodes
 * @param {Map<number, Array<number>>} splits node index → mesh per row, from
 *   `splitCollapsedNodes`
 * @return {Array<object>} `{key, mesh, tableNode, instance, translation,
 *   rotation, scale}`, one per instance
 */
function collectInstances(json, bin, tables, splits) {
  const instances = []
  for (const [nodeIndex, node] of json.nodes.entries()) {
    const tableIndex = node.extras.bldrsTableNode
    const attributes = node.extensions?.[INSTANCING_EXTENSION_NAME]?.attributes
    if (!attributes) {
      if (Number.isInteger(node.mesh)) {
        const table = tables?.[tableIndex] ?? null
        const meshes = splits.get(nodeIndex) ?? [node.mesh]
        const keyed = splits.has(nodeIndex) ? table : null
        meshes.forEach((mesh, j) => instances.push({
          key: keyed ? elementKeyOf(keyed.parents[j], keyed.occurrencePaths?.[j]) : null,
          mesh,
          tableNode: tableIndex,
          instance: j,
          translation: node.translation ?? IDENTITY_TRANSLATION,
          rotation: node.rotation ?? IDENTITY_ROTATION,
          scale: node.scale ?? IDENTITY_SCALE,
        }))
      }
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
 * Split every collapsed node's merged primitive into one mesh per table row.
 *
 * A node is split only when every precondition holds — a table with ranges
 * that tile the primitive exactly, a single indexed primitive on the file's
 * own buffer, an index accessor nothing else uses, and every index inside its
 * own row's vertices (the reader's invariant, `batchedGeometryRanges.js`).
 * Any doubt leaves the node whole: the file still renders correctly, and a
 * half-split node would not.
 *
 * Row 0 takes over the merged mesh and its accessors, re-pointed at its own
 * slice; rows 1..n get new ones appended. So no mesh or accessor is orphaned
 * and nothing needs re-indexing.
 *
 * @param {object} json Parsed glTF JSON, mutated
 * @param {?Uint8Array} bin Its BIN chunk (a private copy), mutated
 * @param {?Array<object>} tables Parsed `BLDRS_instance_tables` nodes
 * @return {Map<number, Array<number>>} node index → mesh index per row
 */
function splitCollapsedNodes(json, bin, tables) {
  const splits = new Map()
  if (!bin || !tables) {
    return splits
  }
  const accessorUses = new Map()
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      for (const index of [...Object.values(primitive.attributes || {}), primitive.indices]) {
        accessorUses.set(index, (accessorUses.get(index) ?? 0) + 1)
      }
    }
  }
  for (const [nodeIndex, node] of json.nodes.entries()) {
    const table = tables[node.extras.bldrsTableNode]
    if (node.extensions?.[INSTANCING_EXTENSION_NAME] || !Array.isArray(table?.ranges)) {
      continue
    }
    const plan = planSplit(json, bin, node, table.ranges, accessorUses)
    if (plan) {
      splits.set(nodeIndex, applySplit(json, bin, node, table.ranges, plan))
    }
  }
  return splits
}


/**
 * Check a collapsed node can be split, and gather what the split needs.
 *
 * @param {object} json
 * @param {Uint8Array} bin
 * @param {object} node
 * @param {Array<object>} ranges the table's rows
 * @param {Map<number, number>} accessorUses how many primitive slots each
 *   accessor fills, file-wide
 * @return {?object} `{primitive, index, indexBytes, base, dv}` — the index
 *   accessor's absolute byte base and a view to rewrite it through — or null
 *   to leave the node whole
 */
function planSplit(json, bin, node, ranges, accessorUses) {
  const primitives = json.meshes?.[node.mesh]?.primitives
  if (!Array.isArray(primitives) || primitives.length !== 1) {
    return null
  }
  const [primitive] = primitives
  const index = json.accessors?.[primitive.indices]
  const position = json.accessors?.[primitive.attributes?.POSITION]
  const indexBytes = INDEX_COMPONENT_BYTES[index?.componentType]
  const indexView = json.bufferViews?.[index?.bufferView]
  const positionView = json.bufferViews?.[position?.bufferView]
  if (!indexBytes || !indexView || !positionView || index.sparse || position.sparse ||
      (indexView.buffer ?? 0) !== 0 || (positionView.buffer ?? 0) !== 0 ||
      accessorUses.get(primitive.indices) !== 1) {
    return null
  }
  for (const attribute of Object.values(primitive.attributes)) {
    const accessor = json.accessors[attribute]
    if (!accessor || accessor.sparse || accessorUses.get(attribute) !== 1) {
      return null
    }
  }
  const last = ranges[ranges.length - 1]
  if (last.vertexStart + last.vertexCount !== position.count ||
      last.indexStart + last.indexCount !== index.count) {
    return null
  }
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const base = (indexView.byteOffset ?? 0) + (index.byteOffset ?? 0)
  for (const {vertexStart, vertexCount, indexStart, indexCount} of ranges) {
    for (let i = indexStart; i < indexStart + indexCount; i++) {
      const value = readIndex(dv, base + (i * indexBytes), indexBytes)
      if (value < vertexStart || value >= vertexStart + vertexCount) {
        return null
      }
    }
  }
  return {primitive, index, indexBytes, base, dv}
}


/**
 * Carry out a planned split: indices rewritten to row-local in place, then
 * one mesh per row over windows onto the merged views.
 *
 * @param {object} json
 * @param {Uint8Array} bin
 * @param {object} node
 * @param {Array<object>} ranges
 * @param {object} plan from `planSplit`
 * @return {Array<number>} mesh index per row
 */
function applySplit(json, bin, node, ranges, plan) {
  const {primitive, index, indexBytes, base, dv} = plan
  for (const {vertexStart, indexStart, indexCount} of ranges) {
    for (let i = indexStart; i < indexStart + indexCount; i++) {
      const at = base + (i * indexBytes)
      writeIndex(dv, at, indexBytes, readIndex(dv, at, indexBytes) - vertexStart)
    }
  }
  // Snapshot the merged accessors before row 0 overwrites them in place.
  const mergedAttributes = Object.entries(primitive.attributes)
    .map(([name, accessorIndex]) => [name, accessorIndex, {...json.accessors[accessorIndex]}])
  const mergedIndex = {...index}
  const mergedMesh = {...json.meshes[node.mesh]}

  const meshes = []
  ranges.forEach(({vertexStart, vertexCount, indexStart, indexCount}, row) => {
    const attributes = {}
    for (const [name, accessorIndex, merged] of mergedAttributes) {
      const view = json.bufferViews[merged.bufferView]
      const slice = windowOnto(merged, view, vertexStart, vertexCount)
      if (name === 'POSITION') {
        Object.assign(slice, floatBounds(bin, slice, view))
      }
      attributes[name] = placeAccessor(json, row === 0 ? accessorIndex : null, slice)
    }
    const indexSlice = {...mergedIndex, count: indexCount}
    indexSlice.byteOffset = (mergedIndex.byteOffset ?? 0) + (indexStart * indexBytes)
    delete indexSlice.min
    delete indexSlice.max
    const indices = placeAccessor(json, row === 0 ? primitive.indices : null, indexSlice)
    const rowPrimitive = {...primitive, attributes, indices}
    const mesh = {...mergedMesh, primitives: [rowPrimitive]}
    if (row === 0) {
      json.meshes[node.mesh] = mesh
      meshes.push(node.mesh)
    } else {
      json.meshes.push(mesh)
      meshes.push(json.meshes.length - 1)
    }
  })
  return meshes
}


/**
 * An accessor that reads `count` elements of `merged` starting at element
 * `start` — the same view, a later offset.
 *
 * @param {object} merged accessor
 * @param {object} view its bufferView
 * @param {number} start first element
 * @param {number} count
 * @return {object} a new accessor (bounds dropped; the caller recomputes
 *   what it needs)
 */
function windowOnto(merged, view, start, count) {
  const elementBytes = COMPONENTS_BY_TYPE[merged.type] * BYTES_PER_FLOAT
  const stride = view.byteStride || elementBytes
  const slice = {...merged, count, byteOffset: (merged.byteOffset ?? 0) + (start * stride)}
  delete slice.min
  delete slice.max
  return slice
}


/**
 * POSITION's `min`/`max`, which glTF requires, read from the slice itself.
 *
 * @param {Uint8Array} bin
 * @param {object} accessor a VEC3 float accessor
 * @param {object} view its bufferView
 * @return {{min: Array<number>, max: Array<number>}}
 */
function floatBounds(bin, accessor, view) {
  const components = COMPONENTS_BY_TYPE.VEC3
  const stride = view.byteStride || (components * BYTES_PER_FLOAT)
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < components; c++) {
      const value = dv.getFloat32(base + (i * stride) + (c * BYTES_PER_FLOAT), true)
      min[c] = Math.min(min[c], value)
      max[c] = Math.max(max[c], value)
    }
  }
  // Shortest float32 round trip, as `glbSlim` prints the writer's own bounds:
  // the same exact values, without spelling each float32 as a 17-digit
  // double. Six numbers per element is most of what a split element's
  // accessors cost in JSON.
  return {min: min.map(shortestFloat32), max: max.map(shortestFloat32)}
}


/**
 * Store an accessor at `at`, or append it when `at` is null.
 *
 * @param {object} json
 * @param {?number} at
 * @param {object} accessor
 * @return {number} its index
 */
function placeAccessor(json, at, accessor) {
  if (at !== null) {
    json.accessors[at] = accessor
    return at
  }
  json.accessors.push(accessor)
  return json.accessors.length - 1
}


/**
 * @param {DataView} dv
 * @param {number} at byte offset
 * @param {number} bytes 1, 2 or 4
 * @return {number}
 */
function readIndex(dv, at, bytes) {
  if (bytes === UINT32_BYTES) {
    return dv.getUint32(at, true)
  }
  return bytes === UINT16_BYTES ? dv.getUint16(at, true) : dv.getUint8(at)
}


/**
 * @param {DataView} dv
 * @param {number} at byte offset
 * @param {number} bytes 1, 2 or 4
 * @param {number} value
 */
function writeIndex(dv, at, bytes, value) {
  if (bytes === UINT32_BYTES) {
    dv.setUint32(at, value, true)
  } else if (bytes === UINT16_BYTES) {
    dv.setUint16(at, value, true)
  } else {
    dv.setUint8(at, value)
  }
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

import {Matrix4} from 'three'
import {instanceGeometryRangeAt} from '../ifc/batchedInstanceGeometry'
import {DEFAULT_CHUNK} from './meshMeasure'


/**
 * Which triangles belong to which element, for `model.measure`: the same
 * three render backends `elementBounds` walks (and the isolator tells apart,
 * IfcIsolator#setModel), turned into "pieces" that {@link ./meshMeasure}
 * measures.
 *
 *  - BatchedMesh (Conway-direct batched, every cache-hit GLB): one piece per
 *    instance whose parent product (`instanceParents`) or STEP occurrence
 *    (`instanceOccurrenceIds`) is wanted. The triangles are the instance's
 *    range in the batch's own buffers (`instanceGeometryRangeAt`, the
 *    accessor the GLB writers and isolation subsets read through), placed by
 *    instance matrix × mesh matrixWorld. `shape` names the source geometry,
 *    so an instanced bolt is welded and closure-checked once.
 *  - Merged Mesh (per-vertex `expressID` attribute): one piece per wanted
 *    element, over a copied index of just its triangles (a triangle belongs
 *    to the element of its first vertex, as the merged builders emit them).
 *  - Scene graph (GLB/OBJ/ADF nodes carrying `expressID`): the node's
 *    subtree meshes, whole.
 *
 * Built once per call over the UNION of everything wanted, so a call naming
 * a hundred refs walks the model's instances once, not a hundred times.
 *
 * A piece is `{key, position, index, indexStart, indexCount, matrix, shape}`
 * (meshMeasure.js). `key` is stable and unique per placed run of triangles,
 * so a total can count a piece once however many refs reach it.
 */


/**
 * Async so a large model can yield while it is indexed: a model of a million
 * placements would otherwise block the page, and a Stop, for the whole walk.
 * Every loop here counts its steps in the shared `work` and awaits `pause()`
 * when `chunk` of them have passed — a comparison per step, an await per
 * chunk, as in meshMeasure.js — and the caller's `pause` checks its signal.
 *
 * @param {object} model the loaded model root (Object3D)
 * @param {object} want
 * @param {Set<number>} want.ids element express ids
 * @param {Set<number>} want.instanceIds STEP occurrence instance ids
 * @param {object} [opts]
 * @param {number} [opts.chunk] steps between yields
 * @param {Function} [opts.pause] `async () => void`, the yield
 * @return {Promise<{forTarget: Function, empty: boolean}>} `forTarget({ids,
 *   instanceIds})` → the target's pieces, deduplicated; `empty` when nothing
 *   wanted has geometry
 */
export async function indexElementPieces(model, {ids, instanceIds}, {chunk = DEFAULT_CHUNK, pause = null} = {}) {
  const byId = new Map()
  const byInstance = new Map()
  const work = {n: 0, chunk, pause}
  const add = (map, id, piece) => {
    const list = map.get(id)
    if (list) {
      list.push(piece)
    } else {
      map.set(id, [piece])
    }
  }
  const sceneNodes = new Map()
  const nodes = []
  if (typeof model?.traverse === 'function') {
    model.updateWorldMatrix(true, true)
    model.traverse((node) => nodes.push(node))
  }
  for (const node of nodes) {
    if (pause && ++work.n % chunk === 0) {
      await pause()
    }
    if (node.isBatchedMesh && node.instanceParents) {
      await indexBatched(node, {ids, instanceIds}, work, (id, piece) => {
        add(byId, id, piece)
      }, (id, piece) => {
        add(byInstance, id, piece)
      })
      continue
    }
    const owners = node.geometry?.attributes?.expressID
    const position = node.geometry?.attributes?.position
    if (owners && position && owners.count === position.count && ids.size > 0) {
      for (const [id, piece] of await mergedPieces(node, owners, ids, work)) {
        add(byId, id, piece)
      }
      continue
    }
    if (Number.isInteger(node.expressID) && ids.has(node.expressID) && node !== model) {
      sceneNodes.set(node.expressID, node)
    }
  }
  for (const [id, node] of sceneNodes) {
    const meshes = []
    node.traverse((mesh) => meshes.push(mesh))
    for (const mesh of meshes) {
      if (mesh.isMesh && mesh.geometry?.attributes?.position && !mesh.isBatchedMesh) {
        for (const piece of await wholeMeshPieces(mesh, work)) {
          add(byId, id, piece)
        }
      }
    }
  }
  return {
    empty: byId.size === 0 && byInstance.size === 0,
    forTarget: ({ids: wantedIds = [], instanceIds: wantedInstances = []}) => {
      const seen = new Map()
      for (const id of wantedIds) {
        byId.get(id)?.forEach((piece) => seen.set(piece.key, piece))
      }
      for (const id of wantedInstances) {
        byInstance.get(id)?.forEach((piece) => seen.set(piece.key, piece))
      }
      return [...seen.values()]
    },
  }
}


/**
 * @param {object} mesh a THREE.BatchedMesh with `instanceParents`
 * @param {object} want `{ids, instanceIds}`
 * @param {object} work the shared step counter `{n, chunk, pause}`
 * @param {Function} onId `(id, piece)` for a piece wanted by its parent id
 * @param {Function} onInstance `(id, piece)` for one wanted by occurrence id
 */
async function indexBatched(mesh, {ids, instanceIds}, work, onId, onInstance) {
  const parents = mesh.instanceParents
  const occurrences = mesh.instanceOccurrenceIds
  // `_instanceInfo` with its active flag, as elementBounds and robustBounds
  // walk it: there's no public instance iterator, and three's getters throw
  // on a deleted id.
  const info = mesh._instanceInfo ?? []
  const range = {}
  const instanceMatrix = new Matrix4()
  for (let batchId = 0; batchId < info.length; batchId++) {
    if (work.pause && ++work.n % work.chunk === 0) {
      await work.pause()
    }
    if (info[batchId].active === false) {
      continue
    }
    const parent = parents[batchId]
    const occurrence = occurrences ? occurrences[batchId] : undefined
    const byParent = ids.has(parent)
    const byOccurrence = occurrences !== undefined && instanceIds.has(occurrence)
    if (!byParent && !byOccurrence) {
      continue
    }
    if (!instanceGeometryRangeAt(mesh, batchId, range)) {
      continue
    }
    mesh.getMatrixAt(batchId, instanceMatrix)
    const piece = {
      key: `b${mesh.id}:${batchId}`,
      position: mesh.geometry.attributes.position,
      index: mesh.geometry.index.array,
      indexStart: range.indexStart,
      indexCount: range.indexCount,
      matrix: new Matrix4().multiplyMatrices(mesh.matrixWorld, instanceMatrix),
      shape: `b${mesh.id}:${range.geometryId}`,
    }
    if (byParent) {
      onId(parent, piece)
    }
    if (byOccurrence) {
      onInstance(occurrence, piece)
    }
  }
}


/**
 * @param {object} mesh a Mesh whose vertices carry an element id each
 * @param {object} owners its `expressID` attribute
 * @param {Set<number>} ids the wanted element ids
 * @param {object} work the shared step counter
 * @return {Promise<Map<number, object>>} a piece per wanted element that has triangles
 */
async function mergedPieces(mesh, owners, ids, work) {
  const geometry = mesh.geometry
  const index = geometry.index ? geometry.index.array : null
  const corners = index ? index.length : geometry.attributes.position.count
  const perOwner = new Map()
  for (let t = 0; t + 2 < corners; t += 3) {
    if (work.pause && ++work.n % work.chunk === 0) {
      await work.pause()
    }
    const first = index ? index[t] : t
    const owner = owners.getX(first)
    if (!ids.has(owner)) {
      continue
    }
    let list = perOwner.get(owner)
    if (!list) {
      list = []
      perOwner.set(owner, list)
    }
    list.push(first, index ? index[t + 1] : t + 1, index ? index[t + 2] : t + 2)
  }
  const pieces = new Map()
  for (const [owner, list] of perOwner) {
    pieces.set(owner, {
      key: `m${mesh.id}:${owner}`,
      position: geometry.attributes.position,
      index: Uint32Array.from(list),
      indexStart: 0,
      indexCount: list.length,
      matrix: mesh.matrixWorld,
      shape: null,
    })
  }
  return pieces
}


/**
 * @param {object} mesh a Mesh, or an InstancedMesh (a glTF with
 *   `EXT_mesh_gpu_instancing` that carries no Share instance tables loads as one)
 * @param {object} work the shared step counter
 * @return {Promise<Array<object>>} the whole mesh as one piece; an InstancedMesh as one
 *   piece per placement it draws (`count`), world = matrixWorld × instance
 *   matrix. Copies share `shape`, so closure is checked once per geometry.
 */
async function wholeMeshPieces(mesh, work) {
  const geometry = mesh.geometry
  const base = {
    position: geometry.attributes.position,
    index: geometry.index ? geometry.index.array : null,
    indexStart: 0,
    indexCount: geometry.index ? geometry.index.count : geometry.attributes.position.count,
  }
  if (!mesh.isInstancedMesh) {
    return [{...base, key: `s${mesh.id}`, matrix: mesh.matrixWorld, shape: null}]
  }
  const pieces = []
  const instanceMatrix = new Matrix4()
  for (let i = 0; i < mesh.count; i++) {
    if (work.pause && ++work.n % work.chunk === 0) {
      await work.pause()
    }
    mesh.getMatrixAt(i, instanceMatrix)
    pieces.push({
      ...base,
      key: `s${mesh.id}:${i}`,
      matrix: new Matrix4().multiplyMatrices(mesh.matrixWorld, instanceMatrix),
      shape: `s${mesh.id}`,
    })
  }
  return pieces
}

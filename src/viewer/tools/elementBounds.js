import {Box3, Matrix4, Vector3} from 'three'


/**
 * World-space bounds of some of a model's elements, for `view.focus`.
 *
 * Nothing in the viewer measures a subset of elements: framing measures the
 * whole model (robustBounds.js), and the selector's focus path is wired off
 * (`ShareViewer#setSelection`'s hardcoded `focusSelection2 = false`). So this
 * walks the three render backends the isolator also distinguishes
 * (IfcIsolator#setModel):
 *
 *  - BatchedMesh (Conway-direct batched, every cache-hit GLB): one box per
 *    instance whose parent product (`instanceParents`) or occurrence
 *    (`instanceOccurrenceIds`) is wanted — geometry-local box × instance
 *    matrix × mesh matrixWorld, the same placement robustBounds uses.
 *  - Merged Mesh (per-vertex `expressID` attribute): the wanted vertices.
 *  - Scene graph (GLB/OBJ/ADF nodes carrying `expressID`): the node's object
 *    box, which covers its subtree.
 *
 * Exact, not outlier-robust: the caller asked for these elements, strays
 * included.
 *
 * @param {object} model the loaded model root (Object3D)
 * @param {object} want
 * @param {Set<number>} [want.ids] element express ids
 * @param {Set<number>} [want.instanceIds] STEP occurrence instance ids
 * @return {Box3|null} null when none of them has geometry
 */
export function elementBounds(model, {ids = new Set(), instanceIds = new Set()}) {
  if (typeof model?.traverse !== 'function') {
    return null
  }
  model.updateWorldMatrix(true, true)
  const box = new Box3()
  const scratch = new Box3()
  const instanceMatrix = new Matrix4()
  const placed = new Matrix4()
  const vertex = new Vector3()
  model.traverse((node) => {
    if (node.isBatchedMesh && node.instanceParents) {
      const parents = node.instanceParents
      const occurrences = node.instanceOccurrenceIds
      const geometryBoxes = new Map()
      // `_instanceInfo` with its active flag: there's no public instance
      // iterator, and three's getters throw on a deleted id (robustBounds.js
      // `collectBatchedElementBoxes` walks it the same way).
      const info = node._instanceInfo ?? []
      for (let batchId = 0; batchId < info.length; batchId++) {
        if (info[batchId].active === false) {
          continue
        }
        const wanted = ids.has(parents[batchId]) ||
          (occurrences && instanceIds.has(occurrences[batchId]))
        if (!wanted) {
          continue
        }
        const geometryId = info[batchId].geometryIndex
        let geometryBox = geometryBoxes.get(geometryId)
        if (!geometryBox) {
          geometryBox = new Box3()
          node.getBoundingBoxAt(geometryId, geometryBox)
          geometryBoxes.set(geometryId, geometryBox)
        }
        if (geometryBox.isEmpty()) {
          continue
        }
        node.getMatrixAt(batchId, instanceMatrix)
        placed.multiplyMatrices(node.matrixWorld, instanceMatrix)
        box.union(scratch.copy(geometryBox).applyMatrix4(placed))
      }
      return
    }
    const expressIds = node.geometry?.attributes?.expressID
    const position = node.geometry?.attributes?.position
    // A scene-graph mesh carries a one-entry placeholder `expressID`
    // (IfcIsolator#setModel), not a per-vertex one; that case is the node
    // branch below.
    if (expressIds && position && expressIds.count === position.count && ids.size > 0) {
      for (let i = 0; i < position.count; i++) {
        if (ids.has(expressIds.getX(i))) {
          box.expandByPoint(vertex.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld))
        }
      }
      return
    }
    if (Number.isInteger(node.expressID) && ids.has(node.expressID) && node !== model) {
      box.union(scratch.setFromObject(node))
    }
  })
  return box.isEmpty() ? null : box
}

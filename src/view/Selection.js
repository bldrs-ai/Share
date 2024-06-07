import {Mesh} from 'three'
// From https://github.com/ThatOpen/web-ifc-viewer/blob/master/viewer/src/components/ifc/selection/selection.ts

/** Highlights selected elements */
export default class Selection {
  constructor(context, loader, material) {
    this.context = context
    this.meshes = new Set()
    // True only for prepick
    this.fastRemovePrevious = false
    this.renderOrder = 0
    this.modelIDs = new Set()
    this.selectedFaces = {}
    this.scene = context.getScene()
    this.loader = loader
    if (material) {
      this.material = material
    }
  }

  async pick(item, focusSelection = false, removePrevious = true) {
    const mesh = item.object
    let tmp
    if (item.faceIndex === undefined ||
        ((tmp = this.selectedFaces[mesh.modelID]) === null ||
         tmp === undefined ? undefined : tmp.has(item.faceIndex))) {
      return null
    }
    const id = mesh.expressID === undefined ? this.loader.ifcManager.getExpressId(mesh.geometry, item.faceIndex) : mesh.expressID
    console.log('faceIndex for lookup:', item.faceIndex)
    // if (true) throw new Error('pause')
    // const id = this.loader.ifcManager.getExpressId(mesh.geometry, item.faceIndex)
    if (id === undefined) {
      return null
    }
    if (removePrevious) {
      if (this.fastRemovePrevious) {
        this.toggleVisibility(false)
        this.modelIDs.clear()
        this.selectedFaces = {}
      }
      else {
        this.unpick()
      }
    }
    if (!this.selectedFaces[mesh.modelID]) {
      this.selectedFaces[mesh.modelID] = new Set()
    }
    this.selectedFaces[mesh.modelID].add(item.faceIndex)
    this.modelIDs.add(mesh.modelID)
    const selected = this.newSelection(mesh.modelID, [id], removePrevious)
    selected.position.copy(mesh.position)
    selected.rotation.copy(mesh.rotation)
    selected.scale.copy(mesh.scale)
    selected.visible = true
    selected.renderOrder = this.renderOrder
    if (focusSelection) {
      await this.focusSelection(selected)
    }
    return {modelID: mesh.modelID, id}
  }

  async pickByID(modelID, ids, focusSelection = false, removePrevious = true) {
    const mesh = this.context.items.ifcModels.find((model) => model.modelID === modelID)
    if (!mesh) {
      return
    }
    if (removePrevious) {
      this.modelIDs.clear()
    }
    this.modelIDs.add(modelID)
    const selected = this.newSelection(modelID, ids, removePrevious)
    selected.visible = true
    selected.position.copy(mesh.position)
    selected.rotation.copy(mesh.rotation)
    selected.scale.copy(mesh.scale)
    selected.renderOrder = this.renderOrder
    if (focusSelection) {
      await this.focusSelection(selected)
    }
  }

  /**
   * Create a selection subset for the given ids and add it to scene
   *
   * @return {Mesh}
   */
  newSelection(modelID, ids, removePrevious) {
    const mesh = this.loader.ifcManager.createSubset({
      scene: this.scene,
      modelID,
      ids,
      removePrevious,
      material: this.material,
    })
    if (mesh) {
      this.meshes.add(mesh)
      this.context.renderer.postProduction.excludedItems.add(mesh)
    }
    return mesh
  }

  /** Detaches this geometry from parent, calls dispose on any sub-geometry and releases instance members */
  dispose() {
    this.meshes.forEach((mesh) => {
      mesh.removeFromParent()
      mesh.geometry.dispose()
    })
    if (this.material) {
      this.material.dispose()
    }
    this.meshes = null
    this.material = null
    this.scene = null
    this.loader = null
    this.context = null
  }

  /** Clear all selected subsets */
  unpick() {
    for (const modelID of this.modelIDs) {
      this.loader.ifcManager.removeSubset(modelID, this.material)
    }
    this.modelIDs.clear()
    this.meshes.clear()
    this.selectedFaces = {}
  }

  /** Toggles all referenced mesh to visibilities */
  toggleVisibility(visible) {
    this.meshes.forEach((mesh) => (mesh.visible = visible))
  }

  /** Target given mesh and apply postproduction to it if active */
  async focusSelection(mesh) {
    const postproductionActive = this.context.renderer.postProduction.active
    this.context.renderer.postProduction.active = false
    await this.context.ifcCamera.targetItem(mesh)
    this.context.renderer.postProduction.active = postproductionActive
  }
}

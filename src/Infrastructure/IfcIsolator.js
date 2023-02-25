import {IfcContext} from 'web-ifc-viewer/dist/components'
import {IfcViewerAPIExtended} from './IfcViewerAPIExtended'
import {unsortedArraysAreEqual, arrayRemove} from '../utils/arrays'
import {Mesh, MeshLambertMaterial, DoubleSide} from 'three'
import useStore from '../store/useStore'
import {BlendFunction} from 'postprocessing'

/**
 *  Provides hiding, unhiding, isolation, and unisolation functionalities
 */
export default class IfcIsolator {
  subsetCustomId = 'Bldrs::Share::Isolator'
  revealSubsetCustomId = 'Bldrs::Share::HiddenElements'
  context = null
  ifcModel = null
  viewer = null
  unhiddenSubset = null
  isolationSubset = null
  revealedElementsSubset = null
  currentSelectionSubsets = []
  ids = []
  spatialStructure = {}
  hiddenIds = []
  isolatedIds = []
  tempIsolationModeOn = false
  revealHiddenElementsMode = false
  hiddenMaterial = null
  isolationOutlineEffect = null

  /**
   * Instantiates a new instance of IfcIsolator
   *
   * @param {IfcContext} context of the viewer
   * @param {IfcViewerAPIExtended} viewer
   */
  constructor(context, viewer) {
    this.context = context
    this.viewer = viewer
    this.initHiddenMaterial()
    this.isolationOutlineEffect = viewer.postProcessor.createOutlineEffect({
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: 5,
      pulseSpeed: 0.0,
      visibleEdgeColor: 0x00FFFF,
      hiddenEdgeColor: 0x00FFFF,
      height: window.innerHeight,
      windth: window.innerWidth,
      blur: false,
      xRay: true,
      opacity: 1,
    })
  }

  /**
   * Sets the loaded model to the isolator context
   *
   * @param {Mesh} (ifcModel) the laoded ifc model mesh
   */
  async setModel(ifcModel) {
    this.ifcModel = ifcModel
    this.ids = [...new Set(ifcModel.geometry.attributes.expressID.array)]
    const rootElement = await this.ifcModel.ifcManager.getSpatialStructure(0, false)
    this.collectSpatialElementsId(rootElement)
  }

  /**
   * Collects spatial elements ids.
   *
   * @param {object} root IFC element
   */
  collectSpatialElementsId(element) {
    if (element.children.length > 0) {
      this.spatialStructure[element.expressID] = element.children.map((e) => e.expressID)
      element.children.forEach((e) => {
        this.collectSpatialElementsId(e)
      })
    }
  }

  /**
   * Flattens element's children if it has any.
   *
   * @param {number} IFC element Id
   * @return {number} element id if no children or {number[]} if has children
   */
  flattenChildren(elementId, result = null) {
    const children = this.spatialStructure[elementId]
    if (result === null) {
      result = [elementId]
    }
    if (children !== undefined && children.length > 0) {
      children.forEach((c) => {
        result.push(c)
        this.flattenChildren(c, result)
      })
    }
    return result
  }

  /**
   * Initializes hide operations subset
   *
   * @param {Array} (includedIds) element ids included in the subset
   */
  initHideOperationsSubset(includedIds, removeModel = true) {
    if (removeModel) {
      this.context.getScene().remove(this.ifcModel)
      this.context.items.pickableIfcModels.pop()
      this.viewer.IFC.selector.selection.unpick()
      this.viewer.IFC.selector.preselection.unpick()
    }
    this.unhiddenSubset = this.ifcModel.createSubset({
      modelID: 0,
      scene: this.context.getScene(),
      ids: includedIds,
      removePrevious: true,
      customID: this.subsetCustomId,
    })
    this.context.items.pickableIfcModels.push(this.unhiddenSubset)
  }

  /**
   * Initializes temporary isolation subset
   *
   * @param {Array} (includedIds) element ids included in the subset
   */
  initTemporaryIsolationSubset(includedIds) {
    this.context.getScene().remove(this.ifcModel)
    this.context.items.pickableIfcModels.pop()
    this.isolationSubset = this.ifcModel.createSubset({
      modelID: 0,
      scene: this.context.getScene(),
      ids: includedIds,
      removePrevious: true,
      customID: this.subsetCustomId,
    })
    this.context.items.pickableIfcModels.push(this.isolationSubset)
    this.isolationOutlineEffect.setSelection([this.isolationSubset])
  }

  /**
   * Hides selected ifc elements
   *
   */
  hideSelectedElements() {
    if (this.tempIsolationModeOn) {
      return
    }
    const selection = this.viewer.getSelectedIds()
    if (selection.length === 0) {
      return
    }
    const noChanges = unsortedArraysAreEqual(selection, this.hiddenIds)
    if (noChanges) {
      return
    }

    const toBeHidden = new Set(selection.concat(this.hiddenIds))
    this.hiddenIds = [...toBeHidden]
    const hiddenIdsObject = Object.fromEntries(
        this.hiddenIds.map((id) => [id, true]))
    useStore.setState({hiddenElements: hiddenIdsObject})
    const toBeShown = this.ids.filter((el) => !this.hiddenIds.includes(el))
    this.initHideOperationsSubset(toBeShown)
    useStore.setState({selectedElements: []})
    this.viewer.setSelection(0, [], false)
  }

  /**
   * Hides ifc elements by their ids
   *
   * @param {Array} (toBeHiddenElementIds) element ids to be hidden
   */
  hideElementsById(toBeHiddenElementIds) {
    if (Array.isArray(toBeHiddenElementIds)) {
      const noChanges = unsortedArraysAreEqual(toBeHiddenElementIds, this.hiddenIds)
      if (noChanges) {
        return
      }
      const toBeHidden = new Set(toBeHiddenElementIds.concat(this.hiddenIds))
      this.hiddenIds = [...toBeHidden]
      const hiddenIdsObject = Object.fromEntries(
          this.hiddenIds.map((id) => [id, true]))
      useStore.setState({hiddenElements: hiddenIdsObject})
    } else if (Number.isFinite(toBeHiddenElementIds)) {
      if (this.hiddenIds.includes(toBeHiddenElementIds)) {
        return
      }
      this.hiddenIds.push(toBeHiddenElementIds)
      useStore.getState().updateHiddenStatus(toBeHiddenElementIds, true)
    } else {
      return
    }
    const toBeShown = this.ids.filter((el) => !this.hiddenIds.includes(el))
    this.initHideOperationsSubset(toBeShown)
    const selection = useStore.getState().selectedElements.filter((el) => !this.hiddenIds.includes(Number(el)))
    useStore.setState({selectedElements: selection})
    if (this.revealHiddenElementsMode) {
      this.revealHiddenElementsMode = false
      this.toggleRevealHiddenElements()
    }
  }

  /**
   * Unhides ifc elements by their ids
   *
   * @param {Array} (toBeUnhiddenElementIds) element ids to be unhidden
   */
  unHideElementsById(toBeUnhiddenElementIds) {
    if (Array.isArray(toBeUnhiddenElementIds)) {
      const toBeShown = toBeUnhiddenElementIds.filter((el) => this.hiddenIds.includes(el))
      if (toBeShown.length === 0) {
        return
      }
      const toBeHidden = new Set(this.hiddenIds.filter((el) => !toBeShown.includes(el)))
      this.hiddenIds = [...toBeHidden]
      const hiddenIdsObject = Object.fromEntries(
          this.hiddenIds.map((id) => [id, true]))
      useStore.setState({hiddenElements: hiddenIdsObject})
    } else if (Number.isFinite(toBeUnhiddenElementIds)) {
      if (this.hiddenIds.includes(toBeUnhiddenElementIds)) {
        this.hiddenIds = arrayRemove(this.hiddenIds, toBeUnhiddenElementIds)
        useStore.getState().updateHiddenStatus(toBeUnhiddenElementIds, false)
      } else {
        return
      }
    } else {
      return
    }
    if (this.hiddenIds.length === 0) {
      this.unHideAllElements()
    } else {
      const toBeShown = this.ids.filter((el) => !this.hiddenIds.includes(el))
      this.initHideOperationsSubset(toBeShown)
    }
    const selection = useStore.getState().selectedElements.map((e) => Number(e))
    this.viewer.setSelection(0, selection, false)
    // reset reveal mode
    if (this.revealHiddenElementsMode) {
      this.revealHiddenElementsMode = false
      this.toggleRevealHiddenElements()
    }
  }

  /**
   * Unhides all hidden elements
   *
   */
  unHideAllElements() {
    if (this.tempIsolationModeOn) {
      return
    }
    this.context.getScene().remove(this.unhiddenSubset)
    this.context.items.pickableIfcModels.pop()
    delete this.unhiddenSubset
    this.context.getScene().add(this.ifcModel)
    this.context.items.pickableIfcModels.push(this.ifcModel)
    this.hiddenIds = []
    useStore.setState({hiddenElements: {}})
    if (this.revealHiddenElementsMode) {
      this.toggleRevealHiddenElements()
    }
  }

  /**
   * Toggles reveal hidden elements from hide and isolate operations
   *
   */
  toggleRevealHiddenElements() {
    if (this.revealHiddenElementsMode) {
      this.revealHiddenElementsMode = false
      this.context.getScene().remove(this.revealedElementsSubset)
      delete this.revealedElementsSubset
    } else {
      let hidden = this.hiddenIds
      if (this.tempIsolationModeOn) {
        hidden = hidden.concat(this.ids.filter((e) => !this.isolatedIds.includes(e)))
      }
      if (hidden.length === 0) {
        this.context.getScene().remove(this.revealedElementsSubset)
        delete this.revealedElementsSubset
        return
      }
      this.revealHiddenElementsMode = true
      this.revealedElementsSubset = this.ifcModel.createSubset({
        modelID: 0,
        scene: this.context.getScene(),
        ids: hidden,
        removePrevious: true,
        customID: this.revealSubsetCustomId,
        material: this.hiddenMaterial,
      })
    }
  }

  /**
   * Checks whether a certain element can be picked in scene or not
   *
   * @param {number} (elementId) the element id
   * @return {boolean} true if hidden, otherwise false
   */
  canBePickedInScene(elementId) {
    if (this.tempIsolationModeOn) {
      return !this.hiddenIds.includes(elementId) && this.isolatedIds.includes(elementId)
    }
    return !this.hiddenIds.includes(elementId)
  }

  /**
   * Checks whether a certain element can be hidden in scene or not
   *
   * @param {number} (elementId) the element id
   * @return {boolean} true if can be hidden, otherwise false
   */
  canBeHidden(elementId) {
    return this.ids.includes(elementId) || Object.keys(this.spatialStructure).includes(`${elementId}`)
  }

  /**
   * Toggles isolation mode
   *
   */
  toggleIsolationMode() {
    if (this.revealHiddenElementsMode) {
      this.toggleRevealHiddenElements()
    }
    if (this.tempIsolationModeOn) {
      this.resetTempIsolation()
    } else {
      this.isolateSelectedElements()
    }
  }

  /**
   * Isolates selected ifc elements
   *
   */
  isolateSelectedElements() {
    const selection = this.viewer.getSelectedIds()
    const noChanges = unsortedArraysAreEqual(selection, this.hiddenIds)
    if (noChanges) {
      return
    }
    this.tempIsolationModeOn = true
    useStore.setState({isTempIsolationModeOn: true})
    this.isolatedIds = selection
    const isolatedIdsObject = Object.fromEntries(
        this.isolatedIds.map((id) => [id, true]))
    useStore.setState({isolatedElements: isolatedIdsObject})
    this.initTemporaryIsolationSubset(selection)
  }

  /**
   * Resets temporary isolation
   *
   */
  resetTempIsolation() {
    if (!this.tempIsolationModeOn) {
      return
    }
    this.tempIsolationModeOn = false
    useStore.setState({isTempIsolationModeOn: false})
    this.isolatedIds = []
    useStore.setState({isolatedElements: {}})
    this.context.getScene().remove(this.isolationSubset)
    this.context.items.pickableIfcModels.pop()
    delete this.isolationSubset
    if (this.hiddenIds.length > 0) {
      const toBeShown = this.ids.filter((el) => !this.hiddenIds.includes( el ))
      this.initHideOperationsSubset(toBeShown, false)
    } else {
      this.context.getScene().add(this.ifcModel)
      this.context.items.pickableIfcModels.push(this.ifcModel)
    }
    this.isolationOutlineEffect.setSelection([])
  }

  /**
   * Initialize hidden elements material.
   *
   */
  initHiddenMaterial() {
    const planes = this.context.getClippingPlanes()
    const color = 0x00FFFF
    const opacity = 0.3
    this.hiddenMaterial = new MeshLambertMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: true,
      side: DoubleSide,
      clippingPlanes: planes,
    })
  }
}

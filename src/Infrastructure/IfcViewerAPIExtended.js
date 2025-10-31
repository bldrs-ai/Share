import {IfcViewerAPI} from 'web-ifc-viewer'
import {MeshLambertMaterial} from 'three'
import IfcHighlighter from './IfcHighlighter'
import IfcIsolator from './IfcIsolator'
import IfcViewsManager from './IfcElementsStyleManager'
import IfcCustomViewSettings from './IfcCustomViewSettings'
import CustomPostProcessor from './CustomPostProcessor'
import debug from '../utils/debug'
import {areDefinedAndNotNull} from '../utils/assert'


const viewParameter = (new URLSearchParams(window.location.search)).get('view')?.toLowerCase() ?? 'default'


const viewRules = {
  'default': [],
  'ch.sia380-1.heatmap': ['Rule1', 'Rule2'],
}
/* eslint-disable jsdoc/no-undefined-types */
/**
 * Extending the original IFCViewerFunctionality
 */
export class IfcViewerAPIExtended extends IfcViewerAPI {
  // TODO: might be useful if we used a Set as well to handle large selections,
  // but for now array is more performant for small numbers
  _selectedExpressIds = []
  _glbSelectionMeshes = [] // Store selection meshes for GLB models
  _glbPreselectionMesh = null // Store preselection mesh for GLB models
  
  /**  */
  constructor(options) {
    super(options)
    const renderer = this.context.getRenderer()
    const scene = this.context.getScene()
    const camera = this.context.getCamera()
    this.postProcessor = new CustomPostProcessor(renderer, scene, camera)
    this.highlighter = new IfcHighlighter(this.context, this.postProcessor)
    this.isolator = new IfcIsolator(this.context, this)
    this.viewsManager = new IfcViewsManager(this.IFC.loader.ifcManager.parser, viewRules[viewParameter])
    
    // Initialize selection materials for GLB models (will be set from CadView theme)
    this._glbSelectMat = null
    this._glbPreselectMat = null
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {IfcCustomViewSettings} customViewSettings (optional) override the ifc elements file colors
   */
  setCustomViewSettings(customViewSettings) {
    this.viewsManager.setViewSettings(customViewSettings)
  }

  /**
   * Sets the selection materials for GLB models
   *
   * @param {MeshLambertMaterial} selectMat - Material for selected elements
   * @param {MeshLambertMaterial} preselectMat - Material for preselected elements
   */
  setGlbSelectionMaterials(selectMat, preselectMat) {
    this._glbSelectMat = selectMat
    this._glbPreselectMat = preselectMat
  }

  /**
   * Emulates pickIfcItemsByID for GLB models by creating selection meshes
   *
   * @param {number} modelID - ID of the model
   * @param {number[]} ids - Express IDs to select
   * @param {boolean} focusSelection - If true, focus camera on selection
   * @param {boolean} removePrevious - If true, remove previous selection
   */
  async pickGlbItemsByID(modelID, ids, focusSelection = false, removePrevious = true) {
    const model = this.context.items.ifcModels[modelID]
    if (!model) {
      debug().warn('Model not found for GLB selection')
      return
    }

    // Remove previous selection meshes if requested
    if (removePrevious && this._glbSelectionMeshes.length > 0) {
      for (const mesh of this._glbSelectionMeshes) {
        this.context.getScene().remove(mesh)
        if (mesh.geometry) {
          mesh.geometry.dispose()
        }
      }
      this._glbSelectionMeshes = []
    }

    // Find and clone meshes for the selected expressIDs
    const selectedMeshes = []
    
    // Recursive function to check node and its children
    const checkNode = (node) => {
      const nodeExpressID = node.expressID
      
      if (nodeExpressID !== undefined && ids.includes(parseInt(nodeExpressID))) {
        // Found a node with matching expressID, collect all meshes under it
        node.traverse((descendant) => {
          if (descendant.geometry) {
            selectedMeshes.push(descendant)
          }
        })
      }
      
      // Recursively check children
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          checkNode(child)
        }
      }
    }
    
    // Start checking from model's direct children
    for (const child of model.children) {
      checkNode(child)
    }

    // Create selection overlay meshes
    const selectMat = this._glbSelectMat || new MeshLambertMaterial({
      transparent: true,
      color: 0x0066ff,
      depthTest: true,
    })

    for (const mesh of selectedMeshes) {
      const selectionMesh = mesh.clone()
      selectionMesh.material = selectMat
      selectionMesh.renderOrder = 1
      this.context.getScene().add(selectionMesh)
      this._glbSelectionMeshes.push(selectionMesh)
    }

    debug().log('IfcViewerAPIExtended#pickGlbItemsByID, created selection meshes: ', this._glbSelectionMeshes.length)
  }

  /**
   * Removes all GLB selection meshes (emulates unpickIfcItems for GLB)
   */
  unpickGlbItems() {
    if (this._glbSelectionMeshes.length > 0) {
      for (const mesh of this._glbSelectionMeshes) {
        this.context.getScene().remove(mesh)
        if (mesh.geometry) {
          mesh.geometry.dispose()
        }
      }
      this._glbSelectionMeshes = []
    }
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {string} url IFC as URL.
   * @param {boolean} fitToFrame (optional) if true, brings the perspectiveCamera to the loaded IFC.
   * @param {Function} onProgress (optional) a callback function to report on downloading progress
   * @param {Function} onError (optional) a callback function to report on loading errors
   * @param {IfcCustomViewSettings} customViewSettings (optional) override the ifc elements file colors
   * @return {IfcModel} ifcModel object
   */
  async loadIfcUrl(url, fitToFrame, onProgress, onError, customViewSettings) {
    this.viewsManager.setViewSettings(customViewSettings)
    return await this.IFC.loadIfcUrl(url, fitToFrame, onProgress, onError)
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {string} file IFC as File.
   * @param {boolean} fitToFrame (optional) if true, brings the perspectiveCamera to the loaded IFC.
   * @param {Function} onError (optional) a callback function to report on loading errors
   * @param {IfcCustomViewSettings} customViewSettings (optional) override the ifc elements file colors
   * @return {IfcModel} ifcModel object
   */
  async loadIfcFile(file, fitToFrame, onError, customViewSettings) {
    this.viewsManager.setViewSettings(customViewSettings)
    return await this.IFC.loadIfc(file, fitToFrame, onError)
  }

  /**
   * Gets the expressId of the element that the mouse is pointing at
   *
   * @return {object} the expressId of the element and modelId
   */
  castRayToIfcScene() {
    const found = this.context.castRayIfc()
    if (!found) {
      return null
    }
    const id = this.getPickedItemId(found)
    return {modelID: found.object.modelID, id}
  }

  /**
   * gets a copy of the current selected expressIds in the scene
   *
   * @return {number[]} the selected express ids in the scene
   */
  getSelectedIds = () => [...this._selectedExpressIds]


  /**
   * sets the current selected expressIds in the scene
   *
   * @param {number} modelID
   * @param {number[]} expressIds express Ids of the elements
   */
  async setSelection(modelID, expressIds, focusSelection) {
    if (this.IFC.type !== 'ifc' && this.IFC.type !== 'glb') {
      debug().warn('setSelection is not supported for this type of model')
      return
    }
    this._selectedExpressIds = expressIds
    const toBeSelected = this._selectedExpressIds.filter((id) => this.isolator.canBePickedInScene(id))
    if (typeof focusSelection === 'undefined') {
      // if not specified, only focus on item if it was the first one to be selected
      focusSelection = toBeSelected.length === 1
    }
    
    // Handle GLB models separately
    if (this.IFC.type === 'glb' || this.IFC.type === 'gltf') {
      if (toBeSelected.length !== 0) {
        await this.pickGlbItemsByID(modelID, toBeSelected, focusSelection, true)
        
        // Also use highlighter for outline effect
        const model = this.context.items.ifcModels[modelID]
        if (model) {
          const selectedMeshes = []
          
          // Recursive function to check node and its children
          const checkNode = (node) => {
            const nodeExpressID = node.expressID
            
            if (nodeExpressID !== undefined && toBeSelected.includes(parseInt(nodeExpressID))) {
              // Found a node with matching expressID, collect all meshes under it
              node.traverse((descendant) => {
                if (descendant.geometry) {
                  selectedMeshes.push(descendant)
                }
              })
            }
            
            // Recursively check children
            if (node.children && node.children.length > 0) {
              for (const child of node.children) {
                checkNode(child)
              }
            }
          }
          
          // Start checking from model's direct children
          for (const child of model.children) {
            checkNode(child)
          }
          
          debug().log('IfcViewerAPIExtended#setSelection (GLB), selected meshes: ', selectedMeshes)
          this.highlighter.setHighlighted(selectedMeshes)
        }
      } else {
        this.unpickGlbItems()
        this.highlighter.setHighlighted(null)
      }
      return
    }
    
    // Handle IFC models
    if (toBeSelected.length !== 0) {
      try {
        debug().log('IfcViewerAPIExtended#setSelection, with Array<toBeSelected>: ', toBeSelected)
        const focusSelection2 = false // TODO(pablo): this was hardcoded as false below; why not using above
        const removePrevious = true
        await this.IFC.selector.pickIfcItemsByID(modelID, toBeSelected, focusSelection2, removePrevious)
        debug().log('IfcViewerAPIExtended#setSelection, meshes: ', this.IFC.selector.selection.meshes)
        this.highlighter.setHighlighted(this.IFC.selector.selection.meshes)
      } catch (e) {
        console.warn('selection failure', e)
        debug().error('IfcViewerAPIExtended#setSelection$onError: ', e)
      }
    } else {
      this.highlighter.setHighlighted(null)
      this.IFC.selector.unpickIfcItems()
    }
  }


  /**
   * Highlights the item pointed by the cursor.
   *
   */
  async highlightIfcItem() {
    const found = this.context.castRayIfc()
    if (!found) {
      // Clear highlights when nothing is hovered
      this.highlighter.setHighlighted(null)
      
      // Clear GLB preselection mesh if exists
      if (this._glbPreselectionMesh) {
        this.context.getScene().remove(this._glbPreselectionMesh)
        if (this._glbPreselectionMesh.geometry) {
          this._glbPreselectionMesh.geometry.dispose()
        }
        this._glbPreselectionMesh = null
      }
      
      // Only toggle preselection visibility for IFC models
      if (this.IFC.type === 'ifc') {
        this.IFC.selector.preselection.toggleVisibility(false)
      }
      return
    }
    
    // For GLB models, create a preselection overlay mesh
    if (this.IFC.type === 'glb' || this.IFC.type === 'gltf') {
      // Remove previous preselection mesh
      if (this._glbPreselectionMesh) {
        this.context.getScene().remove(this._glbPreselectionMesh)
        if (this._glbPreselectionMesh.geometry) {
          this._glbPreselectionMesh.geometry.dispose()
        }
        this._glbPreselectionMesh = null
      }
      
      // Create preselection mesh with preselectMat
      const preselectMat = this._glbPreselectMat || new MeshLambertMaterial({
        transparent: true,
        opacity: 0.5,
        color: 0x0066ff,
        depthTest: true,
      })
      
      const mesh = found.object
      const preselectionMesh = mesh.clone()
      preselectionMesh.material = preselectMat
      preselectionMesh.renderOrder = 0 // Lower than selection
      this.context.getScene().add(preselectionMesh)
      this._glbPreselectionMesh = preselectionMesh
      
      // Also use highlighter for outline effect
      this.highlighter.setHighlighted([mesh])
      return
    }
    
    // For IFC models, use the standard IFC selection logic
    const id = this.getPickedItemId(found)
    if (this.IFC.type === 'ifc' && this.isolator.canBePickedInScene(id)) {
      await this.IFC.selector.preselection.pick(found)
      this.highlightPreselection()
    }
  }


  /**
   * applies Preselection effect on an Element by Id
   *
   * @param {number} modelID
   * @param {number[]} expressIds express Ids of the elements
   */
  async preselectElementsByIds(modelId, expressIds) {
    // Only works for IFC models
    if (this.IFC.type !== 'ifc' && this.IFC.type !== 'glb') {
      debug().warn('preselectElementsByIds is not supported for this type of model')
      return
    }
    
    const filteredIds = expressIds.filter((id) => this.isolator.canBePickedInScene(id)).map((a) => parseInt(a))
    debug().log('IfcViewerAPIExtended#preselectElementsByIds, filteredIds:', filteredIds)
    if (filteredIds.length) {
      await this.IFC.selector.preselection.pickByID(modelId, filteredIds, false, true)
      this.highlightPreselection()
    }
  }

  /**
   * adds the highlighting (outline effect) to the currently preselected element in the viewer
   */
  highlightPreselection() {
    // Deconstruct the preselection meshes set to get the first element in set
    // The preselection set always contains only one element or none
    const [targetMesh] = this.IFC.selector.preselection.meshes
    this.highlighter.addToHighlighting(targetMesh)
  }


  /** @param {Mesh} mesh */
  addToHighlighting(mesh) {
    this.highlighter.addToHighlighting(mesh)
  }


  /** @param {Array<Mesh>} meshes */
  setHighlighted(meshes) {
    this.highlighter.setHighlighted(meshes)
  }


  /**
   * Gets properties for an element by expressID.
   * For GLTF models with bldrsPayload, returns properties from the payload.
   * For IFC models, delegates to the IFC manager.
   *
   * @param {number} modelID
   * @param {number} expressID
   * @return {Promise<object>} The properties object
   */
  async getProperties(modelID, expressID) {
    console.log('getProperties called for modelID:', modelID, 'expressID:', expressID)
    
    const model = this.context.items.ifcModels[modelID]
    console.log('Model found:', !!model)
    
    // Check if model has bldrsPayload (flat map of expressID -> properties)
    if (model && model.userData && model.userData.bldrsPayload) {
      const payload = model.userData.bldrsPayload
      console.log('Found bldrsPayload')
      
      // Try both string and numeric keys
      const props = payload[String(expressID)] || payload[expressID]
      
      if (props) {
        console.log('Found properties in bldrsPayload:', props)
        
        // Convert to the format expected by Share
        const result = {
          expressID: props.expressID,
          type: props.itemProperties?.type || 'IFCOBJECT',
          Name: props.itemProperties?.Name || {value: 'Element'},
          LongName: props.itemProperties?.LongName || props.itemProperties?.Name || {value: 'Element'},
          // Include all other properties
          ...props.itemProperties,
        }
        
        // Add property sets if available
        if (props.propertySets) {
          result.propertySets = props.propertySets
        }
        
        return result
      } else {
        console.log('expressID not found in bldrsPayload, available keys:', Object.keys(payload).slice(0, 10))
      }
    }
    
    // Fallback to IFC manager
    if (this.IFC && this.IFC.loader && this.IFC.loader.ifcManager) {
      console.log('Falling back to IFC manager')
      return await this.IFC.loader.ifcManager.getItemProperties(modelID, expressID)
    }
    
    // Last resort
    console.log('No properties found, returning default')
    return {
      Name: {value: 'Element'},
      LongName: {value: 'Element'},
      expressID: expressID,
    }
  }


  /**
   * Gets the expressID of the picked item.
   * For GLB models, extracts the expressID from mesh userData.
   * For IFC models, uses the IFC manager to get the expressID.
   *
   * @param {object} picked item
   * @return {number} element id
   */
  getPickedItemId(picked) {
    const mesh = picked.object
    if (!areDefinedAndNotNull(mesh.geometry, picked.faceIndex)) {
      return null
    }
    
    // For GLB models, try to get expressID from the node hierarchy
    if (this.IFC.type === 'glb' || this.IFC.type === 'gltf') {
      // Walk up the parent chain to find an expressID
      let currentNode = mesh
      while (currentNode) {
        if (currentNode.expressID !== undefined) {
          return parseInt(currentNode.expressID)
        }
        currentNode = currentNode.parent
      }
      
      // Fallback: check userData
      if (mesh.userData && mesh.userData.expressID !== undefined) {
        return mesh.userData.expressID
      }
      
      // Fallback: check if the name contains an expressID (common in GLB exports)
      if (mesh.name) {
        const match = mesh.name.match(/expressID[_-]?(\d+)/i)
        if (match) {
          return parseInt(match[1])
        }
      }
      
      // Return null if no expressID found
      return null
    }
    
    // For IFC models, use the IFC manager
    const ifcManager = this.IFC
    return ifcManager.loader.ifcManager.getExpressId(mesh.geometry, picked.faceIndex)
  }


  /**
   * Uses the internal renderer to take screenshot of current scene.
   *
   * The image may be fetched to bytes with:
   *
   *   const res = await fetch(dataURI)
   *   const img = await res.blob()
   *
   * @return {string}
   */
  takeScreenshot() {
    const renderer = this.context.renderer
    const dataURI = renderer.newScreenshot()
    return dataURI
  }
}

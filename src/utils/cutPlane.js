import {Box3, BufferAttribute, BufferGeometry, Mesh, Vector3} from 'three'


/* eslint-disable no-magic-numbers */
/**
 * getSelectionAxisFromBoundingBox is the helper method for the cutplane logic
 *
 * @param {Object} boundingBox bouding box
 * @return {Object}
 */
export function getSelectionAxisFromBoundingBox(boundingBox) {
  return {
    x: {
      size: Math.abs( boundingBox.max.x - boundingBox.min.x),
      center: (boundingBox.max.x + boundingBox.min.x) / 2,
    },
    y: {
      size: Math.abs( boundingBox.max.y - boundingBox.min.y),
      center: (boundingBox.max.y + boundingBox.min.y) / 2,
    },
    z: {
      size: Math.abs(boundingBox.max.z - boundingBox.min.z ),
      center: (boundingBox.max.z + boundingBox.min.z) / 2,
    },
  }
}


/**
 * getModelCenter is the helper method for the cutplane logic
 *
 * @param {Object} ifcModel bouding box
 * @return {Object} centerCoordinates
 */
/**
 * getModelCenter is the helper method for the cutplane logic
 *
 * @param {Object} ifcModel bouding box
 * @return {Object} centerCoordinates
 */
export function getModelCenter(ifcModel) {
  return {
    x:
      (ifcModel?.geometry.boundingBox.max.x +
        ifcModel?.geometry.boundingBox.min.x) /
      2,
    y:
      (ifcModel?.geometry.boundingBox.max.y +
        ifcModel?.geometry.boundingBox.min.y) /
      2,
    z:
      (ifcModel?.geometry.boundingBox.max.z +
        ifcModel?.geometry.boundingBox.min.z) /
      2,
  }
}

/**
 * getElementBoundingBox is the helper method to get a bounding box of the element
 *
 * @param {Object} selection bouding box
 * @return {Object} centerCoordinates
 */
export function getElementBoundingBox(selection) {
  const geometry = new BufferGeometry()
  const coordinates = []
  const alreadySaved = new Set()
  const position = selection.geometry.attributes['position']

  for (let i = 0; i < selection.geometry.index.array.length; i++) {
    if (!alreadySaved.has(selection.geometry.index.array[i])) {
      coordinates.push(position.getX(selection.geometry.index.array[i]))
      coordinates.push(position.getY(selection.geometry.index.array[i]))
      coordinates.push(position.getZ(selection.geometry.index.array[i]))
      alreadySaved.add(selection.geometry.index.array[i])
    }
  }

  const vertices = Float32Array.from(coordinates)
  geometry.setAttribute('position', new BufferAttribute(vertices, selection.geometry.index.count))
  const mesh = new Mesh(geometry)
  const boundingBox = new Box3()
  boundingBox.setFromObject(mesh)
  return boundingBox
}

/**
 * toggleClippingPlane turns clipping plane on and off
 *
 * @param {Boolean } on bouding box
 * @param {Number} expressId centerCoordinates
 * @param {IfcViewerAPI } ifcViewer bouding box
 */
export function toggleClippingPlane(on, expressId, ifcViewer) {
  if (on) {
    const modelCenter = getModelCenter()
    const boundingBox = getElementBoundingBox(ifcViewer?.IFC.selector.selection.mesh)
    const selectionAxis = getSelectionAxisFromBoundingBox(boundingBox)

    let direction = 1

    let normal
    if (
      selectionAxis.x.size < selectionAxis.y.size &&
      selectionAxis.x.size < selectionAxis.z.size
    ) {
      if (selectionAxis.x.center > modelCenter.x) {
        direction = -1
      }
      normal = new Vector3(direction, 0, 0)
    } else if (
      selectionAxis.y.size < selectionAxis.x.size &&
      selectionAxis.y.size < selectionAxis.z.size
    ) {
      if (selectionAxis.y.center > modelCenter.y) {
        direction = -1
      }
      normal = new Vector3(0, direction, 0)
    } else {
      if (selectionAxis.z.center > modelCenter.z) {
        direction = -1
      }
      normal = new Vector3(0, 0, direction)
    }

    const point = new Vector3(
        selectionAxis.x.center,
        selectionAxis.y.center,
        selectionAxis.z.center,
    )

    ifcViewer?.clipper.createFromNormalAndCoplanarPoint(normal, point)
    ifcViewer?.IFC.selector.unpickIfcItems()
  } else {
    removePlanes(ifcViewer)
    showElement([expressId], true)
  }
}


/**
 * toggleClippingPlane turns clipping plane on and off
 *
 * @param {IfcViewerAPI } viewer bouding box
 */
function removePlanes(viewer) {
  viewer?.clipper.deleteAllPlanes()
  const clippingPlanes = viewer?.clipper['context'].clippingPlanes
  for (const plane of clippingPlanes) {
    viewer?.clipper['context'].removeClippingPlane(plane)
  }
}


/**
 * toggleClippingPlane turns clipping plane on and off
 *
 * @param {Number} expressId centerCoordinates
 * @param {Boolean } select bouding box
 * @param {IfcViewerAPI } ifcViewer bouding box
 */
export function showElement(expressId, select, ifcViewer) {
  const subset = getSubset(expressId)
  ifcViewer?.context.scene.scene.add(subset)
  if (select) {
    expressId.forEach((element) => selectElement(element))
  }
}


/**
 * selectElement turns clipping plane on and off
 *
 * @param {Number} expressId centerCoordinates
 * @param {IfcViewerAPI } ifcViewer bouding box
 * @param {IfcModel } ifcModel bouding box
 */
async function selectElement(expressId, ifcViewer, ifcModel) {
  ifcViewer?.IFC.selector.selection.pickByID(
      ifcModel.modelID,
      [expressId],
      true,
  )
}


/**
 * selectElement turns clipping plane on and off
 *
 * @param {Number[]} expressId centerCoordinates
 * @param {IfcViewerAPI } ifcViewer bouding box
 * @param {IfcModel } ifcModel bouding box
 * @return {Object}
 */
export function getSubset(expressId, ifcViewer, ifcModel) {
  return ifcViewer?.IFC.loader.ifcManager.createSubset({
    modelID: ifcModel.modelID,
    removePrevious: true,
    ids: expressId,
    scene: ifcViewer?.context.scene.scene,
  })
}


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
 * getModelCenter return the center of the model based on bounding box
 *
 * @param {Object} ifcModel bouding box
 * @return {Object} centerCoordinates
 */
export function getModelCenter(ifcModel) {
  return new Vector3(
      (ifcModel?.geometry.boundingBox.max.x +
        ifcModel?.geometry.boundingBox.min.x) /
      2,
      (ifcModel?.geometry.boundingBox.max.y +
        ifcModel?.geometry.boundingBox.min.y) /
      2,
      (ifcModel?.geometry.boundingBox.max.z +
        ifcModel?.geometry.boundingBox.min.z) /
      2,
  )
}


/**
 * getElementBoundingBox creates a bounding box around the model
 *
 * @param {Object} selection seclected meshes
 * @return {Object} boudingBox geometry
 */
export function getElementBoundingBox(selection) {
  const geometry = new BufferGeometry()
  const coordinates = []
  const alreadySaved = new Set()
  const position = selection.geometry.attributes['position']
  const vertices = Float32Array.from(coordinates)
  const mesh = new Mesh(geometry)
  const boundingBox = new Box3()
  geometry.setAttribute('position', new BufferAttribute(vertices, selection.geometry.index.count))
  boundingBox.setFromObject(mesh)

  for (let i = 0; i < selection.geometry.index.array.length; i++) {
    if (!alreadySaved.has(selection.geometry.index.array[i])) {
      coordinates.push(position.getX(selection.geometry.index.array[i]))
      coordinates.push(position.getY(selection.geometry.index.array[i]))
      coordinates.push(position.getZ(selection.geometry.index.array[i]))
      alreadySaved.add(selection.geometry.index.array[i])
    }
  }

  return boundingBox
}

/**
 * toggleClippingPlane turns clipping plane on and off
 *
 * @param {IfcViewerAPI } viewer bouding box
 */
export function removePlanes(viewer) {
  viewer?.clipper.deleteAllPlanes()
  const clippingPlanes = viewer?.clipper['context'].clippingPlanes
  for (const plane of clippingPlanes) {
    viewer?.clipper['context'].removeClippingPlane(plane)
  }
}


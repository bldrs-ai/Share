import {Box3, BufferAttribute, BufferGeometry, Mesh, Vector3} from 'three'
import {addHashParams} from './location'


/* eslint-disable no-magic-numbers */
/**
 * getSelectionAxisFromBoundingBox is the helper method for the cutplane logic
 *
 * @param {object} boundingBox bouding box
 * @return {object}
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
 * @param {object} ifcModel bouding box
 * @return {object} centerCoordinates
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
 * @param {object} selection seclected meshes
 * @return {object} boudingBox geometry
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
 * @param {object} viewer bouding box
 */
export function removePlanes(viewer) {
  viewer?.clipper.deleteAllPlanes()
  const clippingPlanes = viewer?.clipper['context'].clippingPlanes
  for (const plane of clippingPlanes) {
    viewer?.clipper['context'].removeClippingPlane(plane)
  }
}


/**
 * helper method to get the location of all of the planes currently in the scene
 *
 * @param {object} viewer
 * @param {object} model
 */
export function addPlaneLocationToUrl(viewer, ifcModel) {
  const PLANE_PREFIX = 'p'
  if (viewer.clipper.planes.length > 0) {
    let planeNormal
    let planeAxisCenter
    let planeOffsetFromCenter
    let planeHash
    const planeOffsetFromModelBoundary = viewer.clipper.planes[0].plane.constant
    const modelCenter = getModelCenter(ifcModel)
    for (const [key, value] of Object.entries(viewer.clipper.planes[0].plane.normal)) {
      if (value !== 0 ) {
        planeNormal = key
        planeAxisCenter = modelCenter[planeNormal]
        planeOffsetFromCenter = planeOffsetFromModelBoundary - planeAxisCenter
        const planeOffsetFromCenterTrim = Math.floor(planeOffsetFromCenter)
        planeHash = `${planeNormal},${planeOffsetFromCenterTrim}`
      }
    }
    addHashParams(window.location, PLANE_PREFIX, {planeAxis: planeHash})
  }
}


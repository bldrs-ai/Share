/**
 * Utility functions for element selection across all model formats
 */
import {Mesh} from 'three'


/**
 * Find meshes in scene by elementID
 * Works for both IFC and Object3D models
 * Note: Meshes still have expressID property (for backward compatibility),
 * but this function accepts elementID values (Model interface abstraction)
 *
 * @param {object} scene Three.js Scene object
 * @param {number[]} elementIds Array of elementIDs to find
 * @return {Mesh[]} Array of meshes with matching expressIDs (which equal elementIDs)
 */
export function findMeshesByElementIds(scene, elementIds) {
  const meshes = []
  if (!scene || !Array.isArray(elementIds) || elementIds.length === 0) {
    return meshes
  }

  const elementIdSet = new Set(elementIds)

  scene.traverse((object) => {
    if (object.isMesh && object.expressID !== undefined) {
      // For Object3D models, expressID equals elementID
      // For IFC models, expressID equals elementID (same value, different abstraction)
      if (elementIdSet.has(object.expressID)) {
        meshes.push(object)
      }
    }
  })

  return meshes
}

/**
 * @deprecated Use findMeshesByElementIds instead
 * Kept for backward compatibility
 *
 * @param {object} scene Three.js Scene object
 * @param {number[]} expressIds Array of expressIDs (deprecated, use elementIDs)
 * @return {Mesh[]} Array of meshes with matching expressIDs
 */
export function findMeshesByExpressIds(scene, expressIds) {
  return findMeshesByElementIds(scene, expressIds)
}


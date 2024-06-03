/**
 * GLTF returns a complex object with lights, animations, etc.
 *
 * @param {object} model
 * @return {object} scene
 */
export default function glbToThree(model) {
  if (model.scenes) {
    if (model.scenes.length === 1) {
      return model.scenes[0]
    } else {
      throw new Error('Only single GLTF scenes is implemented')
    }
  }
  throw new Error('GLTF must have a root scenes property')
}

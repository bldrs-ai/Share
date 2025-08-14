import {REVISION} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader'


/**
 * Create a GLTFLoader that can load Draco compressed models
 * 
 * @return {GLTFLoader}
 */
export function createGltfLoader() {
  console.log('THREE.REVISION:', REVISION)
  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('/static/js/draco/')
  dracoLoader.setDecoderConfig({type: 'wasm'})
  dracoLoader.preload()
  loader.setDRACOLoader(dracoLoader)
  return loader
}


/**
 * GLTF returns a complex object with lights, animations, etc.
 *
 * @param {object} model
 * @return {object} scene
 */
export function glbToThree(model) {
  if (model.scenes) {
    if (model.scenes.length === 1) {
      return model.scenes[0]
    } else {
      throw new Error('Only single GLTF scenes is implemented')
    }
  }
  throw new Error('GLTF must have a root scenes property')
}

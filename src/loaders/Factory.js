import * as THREE from 'three'
import {IFCLoader} from 'three/examples/jsm/loaders/IFCLoader'
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader'
import * as Filetype from '../Filetype'
import debug from '../utils/debug'


/**
 * @param {string} urlStr
 * @return {Loader}
 */
export function findLoader(urlStr) {
  const {parts, extension} = Filetype.splitAroundExtension(urlStr)
  let loader = null
  switch (extension) {
    case '.glb':
    case '.gltf': {
      loader = new GLTFLoader
      const dracoLoader = new DRACOLoader
      dracoLoader.setDecoderPath('/static/js/')
      loader.setDRACOLoader(dracoLoader)
      break
    }
    case '.ifc': {
      loader = new IFCLoader
      console.log('LOADER: ', loader)
      loader.ifcManager.setWasmPath('/static/js/')
      break
    }
    case '.obj': loader = new OBJLoader; break
    default: // fallthrough
  }
  return loader
}


/** */
export function doLoad(urlStr, loader, setLoadingMessage) {
  const loadingMessageBase = ''
  return new Promise((resolve, reject) => {
    loader.load(
        urlStr,
        (model) => {
          resolve(model)
        },
        (progressEvent) => {
          if (Number.isFinite(progressEvent.loaded)) {
            const loadedBytes = progressEvent.loaded
            // eslint-disable-next-line no-magic-numbers
            const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
            setLoadingMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
            debug().log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
          }
        },
        (error) => {
          debug().log('Loaders#load: ', error)
          reject(error)
        },
    )
  })
}


export function addEnvMap(scene, renderer) {
  const loader = new THREE.CubeTextureLoader()
  loader.setPath('/')
  // Path to your equirectangular image
  const bi = 'background.jpg'
  console.log('envmap: starting load for : ', bi, scene, renderer)

  const texture = new THREE.TextureLoader().load('/background.jpg')
  scene.background = texture
  scene.environment = texture
  // Load the texture
  /*
  const textureCube = loader.load(
      [
        bi, bi, bi, bi, bi, bi,
      ],
    (texture) => {
        texture.mapping = THREE.CubeReflectionMapping
        texture.encoding = THREE.sRGBEncoding
        texture.generateMipmaps = true // Enable mipmaps
        texture.magFilter = THREE.LinearFilter // Set the texture filters
        texture.minFilter = THREE.LinearMipmapLinearFilter
        console.log('envmap: textureCube: ', textureCube)
      },
      () => {console.log('envmap: progress...')},
      () => {console.error('envmap: error')},
      )
      */
}

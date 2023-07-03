import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'
import * as Filetype from './Filetype'
// import {IfcLoader} from './loaders/IfcLoader'
import debug from './utils/debug'


/**
 * @param {string} urlStr
 * @return {Loader}
 */
export function findLoader(urlStr) {
  const {parts, extension} = Filetype.splitAroundExtension(urlStr)
  let loader = null
  switch (extension) {
    case '.obj': loader = new OBJLoader(); break
    case '.gltf': loader = new GLTFLoader(); break
    // case '.ifc': loader = IfcLoader(); break
    default: // fallthrough
  }
  return loader
}


/** */
export function load(urlStr, loader, setLoadingMessage) {
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

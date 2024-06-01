import axios from 'axios'
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader'
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader'
import {PDBLoader} from 'three/examples/jsm/loaders/PDBLoader'
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader'
import {XYZLoader} from 'three/examples/jsm/loaders/XYZLoader'
import * as Filetype from '../Filetype'
import {assert, assertDefined} from '../utils/assert'
import debug from '../utils/debug'
import BLDLoader from './BLDLoader'
import glbToThree from './glb'
import pdbToThree from './pdb'
import stlToThree from './stl'
import xyzToThree from './xyz'


/**
 * @param {URL} url
 * @return {object|undefined} The model or undefined
 */
export async function load(
  url,
  onProgress = (progressEvent) => debug().log('Loaders#load: progress: ', progressEvent),
  onUnknownType = (errEvent) => debug().error(errEvent),
  onError = (errEvent) => debug().error('Loaders#load: error: ', errEvent),
) {
  assertDefined(url, onProgress, onUnknownType, onError)
  assert(url instanceof URL)

  const [loader, isLoaderAsync, isFormatText, fixupCb] = findLoader(url.pathname)
  debug().log(
    `Loader#load, pathname=${url.pathname} loader=${loader.constructor.name} isLoaderAsync=${isLoaderAsync} isFormatText=${isFormatText}`)

  if (loader === undefined) {
    onUnknownType()
    return undefined
  }

  const modelData = (await axios.get(
    url.toString(),
    {
      responseType:
      isFormatText ? 'text' : 'arraybuffer',
    },
  )).data

  // Provide basePath for multi-file models.  Keep the last '/' for
  // correct resolution of subpaths with '../'.
  const basePath = url.href.substring(0, url.href.lastIndexOf('/') + 1)
  let model = await readModel(loader, modelData, basePath, isLoaderAsync)

  if (fixupCb) {
    model = fixupCb(model)
  }

  return model
}


/**
 * @param {Function} loader
 * @param {string|Buffer} modelData
 * @param {string} basePath
 * @param {boolean} isLoaderAsync
 * @return {object}
 */
async function readModel(loader, modelData, basePath, isLoaderAsync) {
  let model
  // GLTFLoader is unique so far in using an onLoad and onError.
  // TODO(pablo): GLTF also generates errors for texture loads, but
  // that seems to be deep in the promise stack within the loader.
  if (loader instanceof GLTFLoader) {
    model = await new Promise((resolve, reject) => {
      try {
        loader.parse(modelData, './', (m) => {
          resolve(m)
        }, (err) => {
          reject(new Error(`Loader error during parse: ${err}`))
        })
      } catch (e) {
        reject(new Error(`Unhandled error in parse ${e}`))
      }
    })
  } else if (isLoaderAsync) {
    model = await loader.parse(modelData, basePath)
  } else {
    model = loader.parse(modelData, basePath)
  }
  if (!model) {
    throw new Error('Loader could not read model')
  }
  return model
}


/**
 * @param {string} pathname
 * @return {Function|undefined}
 */
function findLoader(pathname) {
  const {extension} = Filetype.splitAroundExtension(pathname)
  let loader
  let isLoaderAsync = false
  let isFormatText = false
  let fixupCb
  switch (extension) {
    case '.bld': {
      loader = new BLDLoader()
      isFormatText = true
      break
    }
    case '.fbx': {
      loader = new FBXLoader()
      break
    }
    case '.obj': {
      loader = new OBJLoader
      isFormatText = true
      break
    }
    case '.pdb': {
      loader = new PDBLoader
      fixupCb = pdbToThree
      isFormatText = true
      break
    }
    case '.stl': {
      loader = new STLLoader
      fixupCb = stlToThree
      isFormatText = false
      break
    }
    case '.xyz': {
      loader = new XYZLoader
      fixupCb = xyzToThree
      isFormatText = true
      break
    }
    case '.glb': {
      loader = newGltfLoader()
      fixupCb = glbToThree
      isLoaderAsync = false
      break
    }
    /*
    case '.3dm': {
      isLoaderAsync = true
      loader = {
        parse: async function(data, path, onLoad, onError) {
          await new Promise((resolve, reject) => {
            const innerLoader = new Rhino3dmLoader()
            innerLoader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@7.15.0/')
            try {
              innerLoader.parse(data, (m) => {
                debug().log('Loader#readModel: promise: model:', m)
                resolve(m)
              }, (err) => {
                debug().log('Loader#readModel: promise: error:', err)
                reject(`Loader error during parse: ${err}`)
              })
            } catch (e) {
              reject(`Unhandled error in parse ${e}`)
            }
          })
        }
      break
    }
    */
    default: throw new Error('Unsupported filetype') // fix
  }
  return [loader, isLoaderAsync, isFormatText, fixupCb]
}


/**
 * @return {GLTFLoader} With DRACO codec enabled
 */
function newGltfLoader() {
  const loader = new GLTFLoader
  const dracoLoader = new DRACOLoader
  dracoLoader.setDecoderPath('./node_modules/three/examples/jsm/libs/draco/')
  loader.setDRACOLoader(dracoLoader)
  return loader
}

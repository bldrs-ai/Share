import axios from 'axios'
import {BufferAttribute, Mesh, Object3D} from 'three'
import {IFCLoader} from 'web-ifc-three'
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader'
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader'
import {PDBLoader} from 'three/examples/jsm/loaders/PDBLoader'
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader'
import {XYZLoader} from 'three/examples/jsm/loaders/XYZLoader'
import * as Filetype from '../Filetype'
import {assertDefined} from '../utils/assert'
import {enablePageReloadApprovalCheck} from '../utils/event'
import debug from '../utils/debug'
import {testUuid} from '../utils/strings'
import {constructDownloadUrl} from './urls'
import BLDLoader from './BLDLoader'
import glbToThree from './glb'
import pdbToThree from './pdb'
import stlToThree from './stl'
import xyzToThree from './xyz'


/**
 * @param {string} path Either a url or filepath
 * @param {object} viewer WebIfcViewer
 * @param {Function} onProgress
 * @param {boolean} setOpfsFile
 * @param {Function} setOpfsFile
 * @param {Function} setLoadedFileInfo
 * @param {string} accessToken
 * @return {object} The model or undefined
 */
export async function load(
  path,
  viewer,
  onProgress,
  isOpfsAvailable,
  setOpfsFile,
  setLoadedFileInfo,
  accessToken = '',
) {
  assertDefined(path, viewer, onProgress, isOpfsAvailable, setOpfsFile, setLoadedFileInfo, accessToken)
  console.log('Loader: in with path:', path)

  // Test for uploaded first
  // Maybe use path.startsWith('/share/v/new')
  if (testUuid(path)) {
    console.log('Loader: upload detected')
    path = getUploadedBlobPath(path)
    // enablePageReloadApprovalCheck()
  }

  let shaHash
  const isLocallyHostedFile = path.indexOf('/') === 0
  if (!isOpfsAvailable) {
    [path, shaHash] = await constructDownloadUrl(path, accessToken, isOpfsAvailable)
  } else if (isLocallyHostedFile) {
    console.log('Loader: locally hosted file')
    path = path
    shaHash = ''
  } else {
    console.log('Loader: download', path, accessToken, isOpfsAvailable);
    // For logged in, you'll get a sha hash back.  otherwise null/undef
    [path, shaHash] = await constructDownloadUrl(path, accessToken, isOpfsAvailable)
  }

  const [loader, isLoaderAsync, isFormatText, fixupCb] = await findLoader(path, viewer)
  console.log(
    `Loader#load, loader=${loader.constructor.name} isLoaderAsync=${isLoaderAsync} isFormatText=${isFormatText} path=${path}`)

  if (loader === undefined) {
    throw new Error(`Unknown filetype for: ${path}`)
  }

  const modelData = await axiosDownload(path, isFormatText, onProgress)

  // Provide basePath for multi-file models.  Keep the last '/' for
  // correct resolution of subpaths with '../'.
  const basePath = path.substring(0, path.lastIndexOf('/') + 1)

  return await readModel(loader, modelData, basePath, isLoaderAsync, viewer, fixupCb)
}


// TODO(pablo): move somewhere?
/**
 * Construct browser's actual blob URL from app URL for uploaded file.
 *
 * @param {string} filepath
 * @return {string}
 */
function getUploadedBlobPath(filepath) {
  const l = window.location
  // TODO(pablo): fix this with the above TODO for ifc suffix.
  filepath = filepath.split('.ifc')[0]
  const parts = filepath.split('/')
  filepath = parts[parts.length - 1]
  filepath = `blob:${l.protocol}//${l.hostname + (l.port ? `:${l.port}` : '')}/${filepath}`
  return filepath
}


/**
 * Construct browser's actual blob URL from app URL for uploaded file.
 *
 * @param {string} filepath
 * @return {string}
 */
export function constructUploadedFilepath(filepath) {
  const l = window.location
  const parts = filepath.split('/')
  filepath = parts[parts.length - 1]
  filepath = `blob:${l.protocol}//${l.hostname + (l.port ? `:${l.port}` : '')}/${filepath}`
  return filepath
}


/**
 * @param {string} path
 * @param {boolean} isFormatText
 * @param {Function} onProgress Handler from UI to display progress messages
 * @return {Array<byte>}
 * @throws Error for different events, with custom messages
 */
async function axiosDownload(path, isFormatText, onProgress) {
  // TODO(pablo): path feels a little underconstrained here.  axios works a
  // little magic here, as either a url string or /foo.pdb work fine
  try {
    return (await axios.get(
      path,
      {
        responseType:
        isFormatText ? 'text' : 'arraybuffer',
        onDownloadProgress: (event) => onProgressHandler(event, onProgress),
      },
    )).data
  } catch (error) {
    if (error.response) {
      const httpNotFound = 404
      console.warn('error.response.status:', error.response.status)
      if (error.response.status === httpNotFound) {
        throw new NotFoundError('File not found')
      } else {
        throw new Error(`Error response from server: status(${error.response.status}), message(${error.response.data})`)
      }
    } else if (error.request) {
      throw new Error(`No response received from server: ${path}`)
    }
    throw new Error('Failed to fetch model data')
  }
}


/**
 * handles updating the stored file meta data for all cases except local files.
 *
 * @param {string} modelUrlStr the final modelUrl that was passed to the viewer
 */
function updateLoadedFileInfo(uploadedFile, modelUrlStr) {
  if (uploadedFile) {
    return
  }
  const githubRegex = /(raw.githubusercontent|github.com)/gi
  if (modelUrlStr.indexOf('/') === 0) {
    setLoadedFileInfo({
      source: 'share', info: {
        url: `${window.location.protocol}//${window.location.host}${modelUrlStr}`,
      },
    })
  } else if (githubRegex.test(modelUrlStr)) {
    setLoadedFileInfo({source: 'github', info: {url: modelUrlStr}})
  }
}


/**
 * TODO(pablo): this is a temporary harness to add some stubs to the loaded mesh
 * to have it not crash helpers for the main viewer.
 *
 * @param {Mesh} model
 * @return {Mesh}
 */
function convertToShareModel(model, viewer) {
  let objIdSerial = 0

  /**
   * Recursively visit the model and its children to add `expressID` and
   * `type` properties to each.
   *
   * @param {Object3D} model
   */
  function recursiveDecorate(obj3d) {
    obj3d.type = obj3d.type || 'IFCOBJECT'
    obj3d.Name = obj3d.Name || {value: 'Object'}
    obj3d.LongName = obj3d.LongName || {value: 'Object'}
    const id = objIdSerial++
    obj3d.expressID = Number.isSafeInteger(obj3d.expressID) ? obj3d.expressID : id
    if (obj3d.geometry) {
      const ids = new Int8Array(1)
      ids[0] = id
      // TODO(pablo)
      // obj3d.geometry = obj3d.geometry || {attributes: {}}

      // const ba = new BufferAttribute(ids, 1)
      // ba.onUpload(() => {})

      // obj3d.geometry.attributes = ba

      const expressIdAttr = new BufferAttribute(ids, 1)
      // eslint-disable-next-line no-empty-function
      expressIdAttr.onUpload(() => {})

      obj3d.geometry.attributes.expressID = expressIdAttr

      const numQuickLookup = 5000 // TODO(pablo): rethink this approach
      const geomIndex = new Array(numQuickLookup)
      for (let i = 0; i < numQuickLookup; i++) {
        geomIndex[i] = obj3d.expressID
      }
      // throw new Error('obj3d')
      // obj3d.geometry.attributes.index = {array: geomIndex}
    }
    if (obj3d.children && obj3d.children.length > 0) {
      obj3d.children.forEach((m) => recursiveDecorate(m))
    }
  }
  recursiveDecorate(model)

  // Override for root
  model.type = model.type || 'IFCPROJECT'
  model.Name = model.Name || {value: 'Model'}
  model.LongName = model.LongName || {value: 'Model'}

  model.ifcManager = viewer.IFC
  model.ifcManager.getSpatialStructure = (modelId, flatten) => {
    return model
  }

  model.getIfcType = (eltType) => eltType

  return model
}


/**
 * @param {Function} loader
 * @param {string|Buffer} modelData
 * @param {string} basePath
 * @param {boolean} isLoaderAsync
 * @param {object} viewer passed to convertToShareModel and optionally to fixupCb
 * @param {Function} [fixupCb] to modify the model
 * @return {object}
 */
async function readModel(loader, modelData, basePath, isLoaderAsync, viewer, fixupCb) {
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

  if (fixupCb) {
    model = fixupCb(model, viewer)
  }

  convertToShareModel(model, viewer)
  return model
}


/**
 * @param {string} pathname
 * @return {Function|undefined}
 */
async function findLoader(pathname, viewer) {
  let extension
  try {
    extension = Filetype.getValidExtension(pathname)
    console.log('Loader#findLoader, extension:', extension)
  } catch (e) {
    // TODO(pablo): need to think thru a better way to do content sniffing
    if (e instanceof Filetype.FilenameParseError) {
      extension = await Filetype.guessType(pathname)
      if (extension === null) {
        throw new Error(`Could not guess filetype for ${pathname}`)
      }
      console.log('Loader#findLoader, hit path parse exception, guessed extension:', extension)
    } else {
      throw e
    }
  }
  const isLoaderAsync = false
  let isFormatText = false
  let loader
  let fixupCb
  switch (extension) {
    case 'bld': {
      loader = new BLDLoader(viewer)
      isFormatText = true
      break
    }
    case 'fbx': {
      loader = new FBXLoader()
      break
    }
    case 'ifc': {
      loader = await newIfcLoader()
      // TODO(pablo): true should work but currently causes IFCLoader to fail
      isFormatText = false
      break
    }
    case 'obj': {
      loader = new OBJLoader
      isFormatText = true
      break
    }
    case 'pdb': {
      loader = new PDBLoader
      fixupCb = pdbToThree
      isFormatText = true
      break
    }
    case 'stl': {
      loader = new STLLoader
      fixupCb = stlToThree
      isFormatText = false
      break
    }
    case 'xyz': {
      loader = new XYZLoader
      fixupCb = xyzToThree
      isFormatText = true
      break
    }
    case 'glb':
    case 'gltf': {
      loader = newGltfLoader()
      fixupCb = glbToThree
      break
    }
    /*
    case '3dm': {
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


/**
 * Sets up the IFCLoader to use the wasm module and move the model to
 * the origin on load.
 */
async function newIfcLoader() {
  const loader = new IFCLoader()
  // TODO(pablo): Now using Conway, it's working, but not sure how!
  // loader.ifcManager.setWasmPath('./')
  // loader.ifcManager.setWasmPath('../web-ifc/')
  // loader.ifcManager.setWasmPath('../../../bldrs-conway/compiled/dependencies/conway-geom/Dist/')

  // Setting COORDINATE_TO_ORIGIN is necessary to align the model as
  // it is in Share.  USE_FAST_BOOLS is also used live, tho not sure
  // what it does.
  await loader.ifcManager.applyWebIfcConfig({
    COORDINATE_TO_ORIGIN: true,
    USE_FAST_BOOLS: true,
  })

  // TODO(pablo): maybe useful to print the coordination matrix from
  // the normalized view for debug?  Will need to be called after
  // model is loaded.
  // const coordMatrix = loader.ifcManager.ifcAPI.GetCoordinationMatrix(0)

  return loader
}


/**
 * Computes progress and calls given onProgress handler
 * @param {Event} progressEvent
 * @param {function} onProgress
 */
function onProgressHandler(progressEvent, onProgress) {
  if (Number.isFinite(progressEvent.loaded)) {
    const loadedBytes = progressEvent.loaded
    // eslint-disable-next-line no-magic-numbers
    const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
    debug().log(`Loader#loadModel$onProgress, ${loadedBytes} bytes`)
    onProgress(`${loadedMegs} MB`)
  }
}


/**
 * For network or file resources that are not found.
 */
export class NotFoundError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'NotFoundError'
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotFoundError) // Captures stack trace, excluding constructor call
    }
  }
}

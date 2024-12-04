import axios from 'axios'
import {BufferAttribute, Matrix4, Mesh, Object3D} from 'three'
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader'
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader'
import {PDBLoader} from 'three/examples/jsm/loaders/PDBLoader'
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader'
import {XYZLoader} from 'three/examples/jsm/loaders/XYZLoader'
import * as Filetype from '../Filetype'
import {getModelFromOPFS, downloadToOPFS, downloadModel} from '../OPFS/utils'
import {assert, assertDefined} from '../utils/assert'
import {enablePageReloadApprovalCheck} from '../utils/event'
import debug from '../utils/debug'
import {parseGitHubPath} from '../utils/location'
import {testUuid} from '../utils/strings'
import {dereferenceAndProxyDownloadUrl} from './urls'
import BLDLoader from './BLDLoader'
import glbToThree from './glb'
import objToThree from './obj'
import pdbToThree from './pdb'
import stlToThree from './stl'
import xyzToThree from './xyz'


/**
 * @param {string} path Either a url or filepath
 * @param {object} viewer WebIfcViewer
 * @param {Function} onProgress
 * @param {boolean} setOpfsFile
 * @param {Function} setOpfsFile
 * @param {string} accessToken
 * @return {object} The model or undefined
 */
export async function load(
  path,
  viewer,
  onProgress,
  isOpfsAvailable,
  setOpfsFile,
  accessToken = '',
) {
  assertDefined(path, viewer, onProgress, isOpfsAvailable, setOpfsFile, accessToken)
  debug().log('Loader#load: in with path:', path)

  // Test for uploaded first
  // Maybe use path.startsWith('/share/v/new')
  const isUploadedFile = testUuid(path)
  if (isUploadedFile) {
    path = constructUploadedBlobPath(path)
    debug().log('Loader#load: file uploaded, blob path:', path)
    enablePageReloadApprovalCheck()
  }

  // All of this is to get a path
  let derefPath
  let shaHash
  // Should be true of all locally hosted files, e.g. /index.ifc.  Uploads will have "blob:" prefix
  const isLocallyHostedFile = path.indexOf('/') === 0
  debug().log(`Loader#load: isLocallyHostedFile:${isLocallyHostedFile} if path has leading slash:`, path)
  if (!isOpfsAvailable) {
    debug().log('Loader#load: download1:', path, accessToken, isOpfsAvailable)
    if (isLocallyHostedFile) {
      derefPath = path
      shaHash = ''
    } else {
      [derefPath, shaHash] = await dereferenceAndProxyDownloadUrl(path, accessToken, isOpfsAvailable)
    }
  } else if (isLocallyHostedFile) {
    debug().log('Loader#load: locally hosted file')
    shaHash = ''
  } else {
    debug().log('Loader#load: download2', path, accessToken, isOpfsAvailable);
    // For logged in, you'll get a sha hash back.  otherwise null/undef
    [derefPath, shaHash] = await dereferenceAndProxyDownloadUrl(path, accessToken, isOpfsAvailable)
    debug().log('Loader#load: download2 DEREFERENCE', derefPath)
  }

  // Find loader can do a head download for content typecheck, but full download is delayed
  const [loader, isLoaderAsync, isFormatText, isIfc, fixupCb] = await findLoader(path, viewer)
  debug().log(
    `Loader#load: loader=${loader.constructor.name} isLoaderAsync=${isLoaderAsync} isFormatText=${isFormatText} path=${path}`)

  if (loader === undefined) {
    throw new Error(`Unknown filetype for: ${path}`)
  }

  let modelData
  if (isOpfsAvailable) {
    // download to file using caching system or else...
    let file
    if (isUploadedFile) {
      debug().log('Loader#load: getModelFromOPFS for upload:', path)
      file = await getModelFromOPFS('BldrsLocalStorage', 'V1', 'Projects', path)
    } else if (isLocallyHostedFile) {
      debug().log('Loader#load: local file:', path)
      file = await downloadToOPFS(
        path,
        path,
        'bldrs-ai',
        'BldrsLocalStorage',
        'V1',
        'Projects',
        onProgress)
    } else {
      let pathUrl
      try {
        pathUrl = new URL(path)
      } catch (e) {
        throw new Error(`Invalid URL path.  Cannot load resource: ${e}, path for URL: ${path}`)
      }
      if (pathUrl.host === 'github.com') {
        // TODO: path was gitpath originally
        const {owner, repo, branch, filePath} = parseGitHubPath(pathUrl.pathname)
        debug().log(`Loader#load: downloadModel with owner, repo, branch, filePath:`, owner, repo, branch, filePath)
        file = await downloadModel(
          derefPath,
          shaHash,
          filePath,
          accessToken,
          owner,
          repo,
          branch,
          setOpfsFile,
          onProgress)
      } else {
        const opfsFilename = pathUrl.pathname
        debug().log(`Loader#load: downloadToOPFS with opfsFilename:`, opfsFilename)
        file = await downloadToOPFS(
          path,
          opfsFilename,
          pathUrl.host,
          'BldrsLocalStorage',
          'V1',
          'Projects',
          onProgress)
      }
    }
    debug().log('Loader#load: File from OPFS:', file)
    setOpfsFile(file)
    modelData = await file.arrayBuffer()
    if (isFormatText) {
      const decoder = new TextDecoder('utf-8')
      modelData = decoder.decode(modelData)
      debug().log('Loader#load: modelData from OPFS (decoded):', modelData)
    }
  } else {
    modelData = await axiosDownload(derefPath, isFormatText, onProgress)
    debug().log('Loader#load: modelData from axios download:', modelData)
  }

  // Provide basePath for multi-file models.  Keep the last '/' for
  // correct resolution of subpaths with '../'.
  const basePath = path.substring(0, path.lastIndexOf('/') + 1)

  const model = await readModel(loader, modelData, basePath, isLoaderAsync, isIfc, viewer, fixupCb)

  if (!isIfc) {
    debug().log('Loader#load: converting non-IFC model to IFC:', model)
    convertToShareModel(model, viewer)
    viewer.IFC.addIfcModel(model)
    viewer.IFC.loader.ifcManager.state.models.push(model)
  }

  return model
}


// TODO(pablo): move somewhere?
/**
 * Construct browser's actual blob URL from app URL for uploaded file.
 *
 * @param {string} filepath
 * @return {string}
 */
export function constructUploadedBlobPath(filepath) {
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
 * @return {Array}
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
    // Next, setup IFC props
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
  debug().log('Overriding project root name')
  model.type = model.type || 'IFCPROJECT'
  model.Name = model.Name || {value: 'Model'}
  model.LongName = model.LongName || {value: 'Model'}
  // model.ifcManager = viewer.IFC
  model.ifcManager = viewer.IFC.loader.ifcManager
  model.ifcManager.getSpatialStructure = (modelId, flatten) => {
    return model
  }
  model.ifcManager.getExpressId = (geom, faceNdx) => {
    debug().log('getExpressId, geom, facedNdx', geom, faceNdx)
    return geom.id
  }

  model.getIfcType = (eltType) => eltType

  return model
}


/**
 * @param {Function} loader
 * @param {string|Buffer} modelData
 * @param {string} basePath
 * @param {boolean} isLoaderAsync
 * @param {boolean} isIfc
 * @param {object} viewer passed to convertToShareModel and optionally to fixupCb
 * @param {Function} [fixupCb] to modify the model
 * @return {object}
 */
export async function readModel(loader, modelData, basePath, isLoaderAsync, isIfc, viewer, fixupCb) {
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
    debug().log(`async loader(->) parsing data:`, loader, modelData)
    model = await loader.parse(modelData, basePath)
  } else {
    debug().log(`sync loader(->) parsing data:`, loader, modelData)
    model = loader.parse(modelData, basePath)
  }
  if (!model) {
    throw new Error('Loader could not read model')
  }

  if (fixupCb) {
    model = fixupCb(model, viewer)
  }

  // TODO(pablo): generalize our handling to multi-mesh
  if (model.geometry === undefined) {
    assertDefined(model.children)
    // E.g. samba-dancing.fbx has Bones for child[0] and 2 meshes after
    for (let i = 0, n = model.children.length; i < n; i++) {
      const obj = model.children[i]
      if (obj.geometry) {
        model.geometry = obj.geometry
        break
      }
    }
    assert(model.geometry !== undefined, 'Could not find geometry to work with in model')
    console.warn('Only using first mesh for some operations')
  }

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
    debug().log('Loader#findLoader, extension:', extension)
  } catch (e) {
    // TODO(pablo): need to think thru a better way to do content sniffing
    if (e instanceof Filetype.FilenameParseError) {
      extension = await Filetype.guessType(pathname)
      if (extension === null) {
        throw new Error(`Could not guess filetype for ${pathname}`)
      }
      debug().log('Loader#findLoader, hit path parse exception, guessed extension:', extension)
    } else {
      throw e
    }
  }
  let isLoaderAsync = false
  let isFormatText = false
  let isIfc = false
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
    case 'step':
    case 'stp':
    case 'ifc': {
      loader = newIfcLoader(viewer)
      isLoaderAsync = true
      // TODO(pablo): true should work but currently causes IFCLoader to fail
      isFormatText = false
      isIfc = true
      break
    }
    case 'obj': {
      loader = new OBJLoader
      fixupCb = objToThree
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
    default: throw new Error(`Unsupported filetype; ${extension}`)
  }
  return [loader, isLoaderAsync, isFormatText, isIfc, fixupCb]
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
 *
 * @return {object} Loader with parse function
 */
function newIfcLoader(viewer) {
  const loader = viewer.IFC
  // Loader is web-ifc-viewer/viewer/src/components/ifc/ifc-manager.ts
  // It internally uses web-ifc-three/Loader
  // Hot patch buffer-based parse alternative.
  loader.parse = async function(
    buffer,
    onProgress,
    onError,
  ) {
    if (this.context.items.ifcModels.length !== 0) {
      throw new Error('Model cannot be loaded.  A model is already present')
    }
    try {
      await this.loader.ifcManager.applyWebIfcConfig({
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLS: true,
      })
      const ifcModel = await this.loader.parse(buffer, onProgress)
      this.addIfcModel(ifcModel)
      // eslint-disable-next-line new-cap
      const matrixArr = await this.loader.ifcManager.ifcAPI.GetCoordinationMatrix(ifcModel.modelID)
      const matrix = new Matrix4().fromArray(matrixArr)
      this.loader.ifcManager.setupCoordinationMatrix(matrix)
      this.context.fitToFrame()
      return ifcModel
    } catch (err) {
      console.error(err)
      if (onError) {
        onError(err)
      }
      return null
    }
  }
  return loader
}


/**
 * Computes progress and calls given onProgress handler
 *
 * @param {Event} progressEvent
 * @param {Function} onProgress
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


/** For network or file resources that are not found. */
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

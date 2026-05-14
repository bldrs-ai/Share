import axios from 'axios'
import {Box3, BufferAttribute, Group, Matrix4, Mesh, Object3D, Vector3} from 'three'
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js'
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js'
import {PDBLoader} from 'three/examples/jsm/loaders/PDBLoader.js'
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js'
import {XYZLoader} from 'three/examples/jsm/loaders/XYZLoader.js'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import * as Filetype from '../Filetype'
import {
  doesFileExistInOPFS,
  downloadModel,
  downloadToOPFS,
  getModelFromOPFS,
  readModelByPathFromOPFS,
  writeBase64Model,
} from '../OPFS/utils'
import {HTTP_NOT_FOUND} from '../net/http'
import {assertDefined} from '../utils/assert'
import {enablePageReloadApprovalCheck} from '../utils/event'
import debug from '../utils/debug'
import {navigateBaseOnModelPath, parseGitHubPath} from '../utils/location'
import {updateRecentFileLastModified} from '../connections/persistence'
import {testUuid} from '../utils/strings'
import {decorateShareModel} from '../viewer/ShareModel'
import {dereferenceAndProxyDownloadContents} from './urls'
import BLDLoader from './BLDLoader'
import {ExtBldrsPropertiesPayload} from './ExtBldrsPropertiesPayload'
import {exportAndCacheGlb} from './glbExport'
import glbToThree from './glb'
import {glbCacheKey} from './glbCacheKey'
import {activeGlbCompressionMode, activeSchemaVersion} from './glbCompress'
import {isBldrsGlbContainer, unpackGlbContainer} from './glbContainer'
import {glbInfo, glbVerbose} from './glbLog'
import {
  externalCacheKey,
  gitHubCacheKey,
  localCacheKey,
  uploadCacheKey,
} from './sourceCacheKey'
import objToThree from './obj'
import pdbToThree from './pdb'
import stlToThree from './stl'
import xyzToThree from './xyz'
import {isFeatureEnabled} from '../FeatureFlags'
import {sha1Hex} from '../utils/contentHash'
import {isOutOfMemoryError} from '../utils/oom'


/**
 * @param {string|URL} path Either a url or filepath
 * @param {object} viewer WebIfcViewer
 * @param {Function} onProgress
 * @param {boolean} isOpfsAvailable
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
  // HACK: pathArg can be a URL or a string
  if (path instanceof URL) {
    path = path.toString()
  }

  // TODO(pablo): we should pass in the routeResult instead of the path
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
  let isCacheHit
  let isBase64
  // Should be true of all locally hosted files, e.g. /index.ifc.  Uploads will have "blob:" prefix
  const isLocallyHostedFile = !path.startsWith('blob:') && !path.startsWith('http')
  debug().log(`Loader#load: isLocallyHostedFile:${isLocallyHostedFile} if path has leading slash:`, path)
  if (!isOpfsAvailable) {
    debug().log('Loader#load: download1:', path, accessToken, isOpfsAvailable)
    if (isLocallyHostedFile) {
      derefPath = path
      shaHash = ''
      isCacheHit = false
    } else {
      [derefPath, shaHash, isCacheHit, isBase64] = await dereferenceAndProxyDownloadContents(path, accessToken, isOpfsAvailable)
    }
  } else if (isLocallyHostedFile) {
    debug().log('Loader#load: locally hosted file')
    shaHash = ''
  } else {
    debug().log('Loader#load: download2', path, accessToken, isOpfsAvailable);
    // For logged in, you'll get a sha hash back.  otherwise null/undef
    [derefPath, shaHash, isCacheHit, isBase64] = await dereferenceAndProxyDownloadContents(path, accessToken, isOpfsAvailable)
    debug().log('Loader#load: download2 DEREFERENCE', derefPath)
  }

  // Find loader can do a head download for content typecheck, but full download is delayed
  onProgress(`Determining file type...`)
  // GLB skip path below may swap these to the GLB loader tuple.
  let [loader, isLoaderAsync, isFormatText, isIfc, fixupCb] = await findLoader(path, viewer)
  debug().log(
    `Loader#load: loader=${loader.constructor.name} isLoaderAsync=${isLoaderAsync} isFormatText=${isFormatText} path=${path}`)

  if (loader === undefined) {
    throw new Error(`Unknown filetype for: ${path}`)
  }

  let modelData
  // GLB export context: captured after the source file is in hand if the
  // `glb` feature is on and the source is IFC. Carries the cacheKeyArgs
  // (source-kind namespace + sourceHash) the post-parse writer will use.
  // Stays null when the GLB cache skip-path fires (file is already a GLB).
  let glbExportContext = null
  // Set when we swap the IFC source with a cached GLB. Drives post-parse
  // diagnostics so the user can see what the GLTF parser produced.
  let cameFromGlbCache = false
  const wantGlb = isFeatureEnabled('glb') && isIfc
  if (wantGlb) {
    glbInfo('feature enabled')
  }

  if (isOpfsAvailable) {
    onProgress('Preparing file download...')
    let file
    // Per-source-kind cache-key context. Built eagerly for GitHub (we have
    // the upstream sha before download) and lazily for everything else
    // (we hash the bytes after they're in OPFS).
    let cacheKeyArgs = null
    let kindLabel = null

    if (isUploadedFile) {
      kindLabel = 'upload'
      debug().log('Loader#load: getModelFromOPFS for upload:', path)
      file = await getModelFromOPFS('BldrsLocalStorage', 'V1', 'Projects', path)
    } else if (isLocallyHostedFile) {
      kindLabel = 'local'
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
        kindLabel = 'github'
        // TODO: path was gitpath originally
        const {owner, repo, branch, filePath} = parseGitHubPath(pathUrl.pathname)

        // if we got a cache hit and the file doesn't exist in OPFS, query with no cache
        if (isCacheHit && !(await doesFileExistInOPFS(filePath, shaHash, owner, repo, branch))) {
          [derefPath, shaHash, isCacheHit, isBase64] = await dereferenceAndProxyDownloadContents(path, accessToken, isOpfsAvailable, false)
        }

        // GitHub gives us a stable upstream sha *before* we download — so
        // the GLB cache lookup can happen pre-download (fastest hit path).
        if (wantGlb && shaHash) {
          cacheKeyArgs = gitHubCacheKey({owner, repo, branch, filePath, shaHash})
          glbInfo(
            `reader: cache lookup github key=${cacheKeyArgs.ns1}/${cacheKeyArgs.ns2}/${cacheKeyArgs.ns3}/` +
            `${cacheKeyArgs.sourcePath} sha=${cacheKeyArgs.sourceHash}`)
          glbVerbose('reader: cacheKeyArgs =', cacheKeyArgs)
          const glbFile = await tryLoadCachedGlb(cacheKeyArgs)
          if (glbFile) {
            glbInfo(
              `reader: github cache HIT (${glbFile.size}B); swapping to GLB loader for: ${filePath}`)
            ;[loader, isLoaderAsync, isFormatText, isIfc, fixupCb] = swapToGlbLoader(viewer)
            file = glbFile
            cameFromGlbCache = true
          } else {
            glbInfo('reader: github cache MISS, will export after parse:', filePath)
          }
        }

        if (!file) {
          if (isBase64) {
            file = await writeBase64Model(derefPath, shaHash, filePath, accessToken, owner, repo, branch, setOpfsFile)
          } else {
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
              onProgress,
              (lastModifiedGithub) => {
                const sharePath = navigateBaseOnModelPath(owner, repo, branch, `/${filePath}`)
                updateRecentFileLastModified(sharePath, lastModifiedGithub)
              })
          }
        }
      } else {
        kindLabel = 'external'
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

    // For non-GitHub sources we don't have an upstream sha, so we hash the
    // bytes ourselves to build the cache key. This is the same File we'd
    // read for parse below; reading it twice is cheap (OPFS).
    if (wantGlb && !cacheKeyArgs && file) {
      const sourceBytes = await file.arrayBuffer()
      const contentSha = await sha1Hex(sourceBytes)
      cacheKeyArgs = buildNonGitHubCacheArgs(kindLabel, path, contentSha)
      if (cacheKeyArgs) {
        glbInfo(
          `reader: cache lookup ${kindLabel} key=${cacheKeyArgs.ns1}/${cacheKeyArgs.ns2}/${cacheKeyArgs.ns3}/` +
          `${cacheKeyArgs.sourcePath} sha=${contentSha}`)
        glbVerbose('reader: cacheKeyArgs =', cacheKeyArgs)
        const glbFile = await tryLoadCachedGlb(cacheKeyArgs)
        if (glbFile) {
          glbInfo(
            `reader: ${kindLabel} cache HIT (${glbFile.size}B); swapping to GLB loader`)
          ;[loader, isLoaderAsync, isFormatText, isIfc, fixupCb] = swapToGlbLoader(viewer)
          file = glbFile
          cameFromGlbCache = true
        } else {
          glbInfo(`reader: ${kindLabel} cache MISS, will export after parse`)
        }
      }
    }

    if (wantGlb && isIfc && cacheKeyArgs) {
      glbExportContext = {kindLabel, cacheKeyArgs}
    }

    onProgress('Reading model data...')
    modelData = await file.arrayBuffer()
    if (isFormatText) {
      onProgress('Decoding model data...')
      const decoder = new TextDecoder('utf-8')
      modelData = decoder.decode(modelData)
      debug().log('Loader#load: modelData from OPFS (decoded):', modelData)
    }
  } else if (isBase64) {
    // Contents API returned the file inline; no download fetch needed.
    onProgress('Decoding model data...')
    modelData = decodeBase64ModelData(derefPath, isFormatText)
    debug().log('Loader#load: modelData from inline base64 (decoded):', modelData)
  } else {
    onProgress('Downloading model data...')
    modelData = await axiosDownload(derefPath, isFormatText, onProgress)
    debug().log('Loader#load: modelData from axios download:', modelData)
  }

  // Provide basePath for multi-file models.  Keep the last '/' for
  // correct resolution of subpaths with '../'.
  const basePath = path.substring(0, path.lastIndexOf('/') + 1)

  let model
  try {
    model = await readModel(loader, modelData, basePath, isLoaderAsync, isIfc, viewer, fixupCb, onProgress)
  } catch (e) {
    if (isOutOfMemoryError(e)) {
      e.isOutOfMemory = true
    }
    throw e
  }

  if (model === null || model === undefined) {
    // If loader captured a last error, surface that
    const lastErr = (viewer && viewer.IFC && viewer.IFC.ifcLastError) || new Error('Failed to parse IFC model')
    if (isOutOfMemoryError(lastErr)) {
      lastErr.isOutOfMemory = true
    }
    throw lastErr
  }

  model.isUploadedFile = isUploadedFile
  // Used for automatic naming, page title and other areas that need a mime type.
  model.mimeType = loader.type

  if (!isIfc) {
    onProgress('Converting model format...')
    debug().log('Loader#load: converting non-IFC model to IFC:', model)
    if (cameFromGlbCache) {
      const summary = summarizeGlbScene(model)
      glbInfo(
        `reader: parsed GLB OK: nodes=${summary.nodes} meshes=${summary.meshes} ` +
        `verts=${summary.vertices} bounds=${summary.boundsStr} ` +
        `centerOffset=${summary.centerOffsetStr}`)
      if (summary.meshes === 0) {
        glbInfo('reader: WARN — GLB has 0 meshes; export likely produced an empty scene')
      } else if (summary.vertices === 0) {
        glbInfo('reader: WARN — GLB has meshes but 0 vertices; degenerate geometry')
      }
    }
    convertToShareModel(model, viewer)
    viewer.IFC.addIfcModel(model)
    viewer.IFC.loader.ifcManager.state.models.push(model)
  }

  // Used for GA stats
  model.type = loader.type

  // ShareModel decoration (see src/viewer/ShareModel.js): adds
  // `format` + `capabilities` so call-sites can branch on intrinsic
  // model capability instead of guessing from `viewer.IFC.type`.
  decorateShareModel(model, loader.type)

  // Fire-and-forget: serialize the rendered model to GLB and stash in
  // OPFS so the next load of the same source can skip the IFC parse.
  // Triggered for every source kind (github, local, upload, external)
  // when the `glb` feature flag is on. Failures are logged but never
  // thrown — the source is already on screen; this is cache warm-up only.
  // Design: design/new/glb-model-sharing.md §"Pipelines/A. Originator".
  if (glbExportContext) {
    glbVerbose('writer: scheduling export, kind =', glbExportContext.kindLabel)
    exportAndCacheGlb({
      model,
      kindLabel: glbExportContext.kindLabel,
      cacheKeyArgs: glbExportContext.cacheKeyArgs,
    })
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
 * Decode base64-encoded model bytes (as returned inline by the GitHub
 * Contents API for files under ~1MB) into the shape `readModel` expects.
 * Used by the non-OPFS path when the dereference returned inline content
 * instead of a download URL.
 *
 * @param {string} base64 Base64-encoded file bytes
 * @param {boolean} isFormatText True if the loader expects a text body
 * @return {ArrayBuffer|string}
 */
function decodeBase64ModelData(base64, isFormatText) {
  const binary = atob(base64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  if (isFormatText) {
    return new TextDecoder('utf-8').decode(bytes)
  }
  return bytes.buffer
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
        onDownloadProgress: (event) => onDownloadProgressHandler(event, onProgress),
      },
    )).data
  } catch (error) {
    if (error.response) {
      if (error.response.status === HTTP_NOT_FOUND) {
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
 * @param {object} viewer
 * @return {Mesh}
 */
function convertToShareModel(model, viewer) {
  let objIdSerial = 0

  /**
   * Recursively visit the model and its children to add `expressID` and
   * `type` properties to each.
   *
   * @param {Object3D} obj3d
   * @param {number} depth
   */
  function recursiveDecorate(obj3d, depth = 0) {
    // Next, setup IFC props
    obj3d.type = obj3d.type || 'IFCOBJECT'
    obj3d.Name = obj3d.Name || (depth === 0 ? undefined : {value: 'Object'})
    obj3d.LongName = obj3d.LongName || (depth === 0 ? undefined : {value: 'Object'})
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
      obj3d.children.forEach((m) => recursiveDecorate(m, depth + 1))
    }
  }

  recursiveDecorate(model)

  // Override for root
  debug().log('Overriding project root name')
  model.type = model.type || 'IFCPROJECT'
  model.Name = model.Name || {value: `${model.mimeType} model`}
  model.LongName = model.LongName || {value: `${model.mimeType} model`}
  // This is used for page title and other areas that need a model name, so if it's not
  // useful, set to undefined and we'll use the modelPath later instead.
  if (model.name === undefined || model.name === null || model.name === '') {
    model.name = model.LongName?.value ?? model.Name?.value
    if (model.name === undefined || model.name === null || model.name === '') {
      model.name = undefined
    }
  }

  // model.ifcManager = viewer.IFC
  model.ifcManager = viewer.IFC.loader.ifcManager
  model.ifcManager.getSpatialStructure = () => {
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
 * @param {Function} [onProgress] progress callback for IFC loading
 * @return {object}
 */
export async function readModel(loader, modelData, basePath, isLoaderAsync, isIfc, viewer, fixupCb, onProgress) {
  let model
  // GLTFLoader is unique so far in using an onLoad and onError.
  // TODO(pablo): GLTF also generates errors for texture loads, but
  // that seems to be deep in the promise stack within the loader.
  if (loader instanceof GLTFLoader) {
    if (isBldrsGlbContainer(modelData)) {
      model = await parseBldrsGlbContainer(loader, modelData)
    } else {
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
    }
  } else if (isLoaderAsync) {
    debug().log(`async loader(->) parsing data:`, loader, modelData)
    if (isIfc && onProgress) {
      model = await loader.parse(modelData, onProgress)
    } else {
      if (onProgress) {
        onProgress('Parsing model data...')
      }
      model = await loader.parse(modelData, basePath)
    }
  } else {
    debug().log(`sync loader(->) parsing data:`, loader, modelData)
    if (onProgress) {
      onProgress('Processing model data...')
    }
    model = loader.parse(modelData, basePath)
  }

  if (!model) {
    throw new Error('Loader could not read model')
  }

  if (fixupCb) {
    if (onProgress) {
      onProgress('Applying model fixups...')
    }
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

    // TODO(pablo): temporarily removed to get glb working, but seems to work
    // pretty well.  This involved hardening other uses of .geometry
    // assert(model.geometry !== undefined, 'Could not find geometry to work with in model')
    // This is too chatty.
    // console.warn('Could not identify default mesh to use for some operations')
  }

  return model
}


/**
 * @param {string} pathname
 * @param {object} viewer
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
      viewer.IFC.type = 'glb'
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
  // Reported to GA
  loader.type = extension
  return [loader, isLoaderAsync, isFormatText, isIfc, fixupCb]
}


/**
 * Construct the GLTFLoader used for .glb/.gltf loads.
 *
 * Registers `ExtBldrsPropertiesPayload` so cached Bldrs GLB artifacts (see
 * design/new/glb-model-sharing.md) expose their gzipped properties payload
 * on `gltf.scene.userData.bldrsPayload`.
 *
 * Decoder wiring is gated on the matching compression feature flag, so
 * a reader that's already paying for a compressed-artifact cache hit
 * gets the right decoder; readers running with the flag off skip the
 * decoder cost (and would miss the cache anyway because the schema
 * version embedded in the filename partitions compressed vs not).
 * Three 0.135's DRACO regression is resolved by the r184 upgrade
 * (PR #1514); the flag now exists to gate both write and read.
 *
 * @return {GLTFLoader}
 */
function newGltfLoader() {
  const loader = new GLTFLoader()
  loader.register((parser) => new ExtBldrsPropertiesPayload(parser))
  if (isFeatureEnabled('glbDraco')) {
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/static/js/draco/')
    dracoLoader.setDecoderConfig({type: 'wasm'})
    loader.setDRACOLoader(dracoLoader)
  }
  if (isFeatureEnabled('glbMeshopt')) {
    // Lazy: MeshoptDecoder.ready resolves on first await; GLTFLoader
    // awaits it internally before decoding a buffer view tagged with
    // EXT_meshopt_compression, so registering here is cheap.
    loader.setMeshoptDecoder(MeshoptDecoder)
  }
  return loader
}


/**
 * Sets up the IFCLoader to use the wasm module and move the model to
 * the origin on load.
 *
 * @param {object} viewer
 * @return {object} Loader with parse function
 */
function newIfcLoader(viewer) {
  const loader = viewer.IFC
  // Track last IFC parse error (especially when parse returns null)
  loader.ifcLastError = null
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
      if (onProgress) {
        onProgress('Configuring loader...')
      }
      await this.loader.ifcManager.applyWebIfcConfig({
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLS: true,
      })

      if (onProgress) {
        onProgress('Parsing model geometry...')
      }
      const ifcModel = await this.loader.parse(buffer, onProgress)
      this.addIfcModel(ifcModel)

      if (onProgress) {
        onProgress('Setting up coordinate system...')
      }
      // eslint-disable-next-line new-cap
      const matrixArr = await this.loader.ifcManager.ifcAPI.GetCoordinationMatrix(ifcModel.modelID)
      const matrix = new Matrix4().fromArray(matrixArr)
      this.loader.ifcManager.setupCoordinationMatrix(matrix)

      if (onProgress) {
        onProgress('Fitting model to frame...')
      }
      this.context.fitToFrame()

      if (onProgress) {
        onProgress('Gathering model statistics...')
      }
      const statsApi = this.loader.ifcManager.ifcAPI.getStatistics(0)
      ifcModel.name = statsApi.projectName ?? undefined
      const loadStats = {
        loaderVersion: this.loader.ifcManager.ifcAPI.getConwayVersion(),
        geometryMemory: statsApi.getGeometryMemory(),
        geometryTime: statsApi.getGeometryTime(),
        ifcVersion: statsApi.getVersion(),
        loadStatus: statsApi.getLoadStatus(),
        originatingSystem: statsApi.getOriginatingSystem(),
        preprocessorVersion: statsApi.getPreprocessorVersion(),
        parseTime: statsApi.getParseTime(),
        totalTime: statsApi.getTotalTime(),
      }
      ifcModel.loadStats = loadStats

      if (onProgress) {
        onProgress('Model loaded successfully!')
      }
      return ifcModel
    } catch (err) {
      loader.ifcLastError = err
      // Rethrow OOM so callers can present a tailored UX message.
      if (isOutOfMemoryError(err)) {
        err.isOutOfMemory = true // tag for convenience
        throw err
      }
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
function onDownloadProgressHandler(progressEvent, onProgress) {
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


/**
 * Look up a cached Bldrs GLB artifact in OPFS for a given source file. Returns
 * the GLB `File` if present, or `null` if no artifact has been generated yet
 * (or has a mismatched schema/source hash). Never throws; failures resolve to
 * null so the caller falls back to the IFC path.
 *
 * Design: design/new/glb-model-sharing.md §"Caching and lookup".
 *
 * @param {object} cacheKeyArgs Output of a sourceCacheKey adapter
 *   ({ns1, ns2, ns3, sourcePath, sourceHash}).
 * @return {Promise<File|null>}
 */
async function tryLoadCachedGlb(cacheKeyArgs) {
  try {
    // Schema version varies with the active compression flag so a flag-
    // off reader never picks up a flag-on writer's compressed bytes
    // (and vice versa). See glbCompress.js#schemaVersionFor.
    const requestedMode = activeGlbCompressionMode()
    const schemaVer = activeSchemaVersion()
    const key = glbCacheKey({...cacheKeyArgs, schemaVer})
    const exists = await doesFileExistInOPFS(
      key.originalFilePath, key.commitHash, key.owner, key.repo, key.branch)
    if (!exists) {
      return null
    }
    const file = await readModelByPathFromOPFS(
      key.originalFilePath, key.commitHash, key.owner, key.repo, key.branch)
    if (!file) {
      return null
    }
    // Verify the cached artifact's compression mode matches what the
    // user asked for. The schema-suffix filename partitioning is the
    // first line of defense; this is the second — it catches stale
    // artifacts written by an earlier code revision (pre-mode-byte) or
    // pollution in the OPFS slot. On mismatch we treat it as a miss
    // so the IFC parse path runs and the writer rewrites a correct
    // artifact.
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isBldrsGlbContainer(bytes)) {
      glbInfo('reader: found OPFS file but it is not a Bldrs container; treating as miss')
      return null
    }
    const peek = unpackGlbContainer(bytes)
    if (peek.mode !== requestedMode) {
      glbInfo(
        `reader: cached artifact mode mismatch (cached=${peek.mode || 'none'}, ` +
        `requested=${requestedMode || 'none'}); treating as miss`)
      return null
    }
    return file
  } catch (e) {
    glbInfo('reader: lookup failed, falling back to source path:', e)
    return null
  }
}


/**
 * Swap the loader tuple from IFC to GLB. Used by the GLB cache skip-path
 * once we've confirmed a cached artifact exists for the source.
 *
 * @param {object} viewer
 * @return {[object, boolean, boolean, boolean, Function]} loader tuple
 *   matching findLoader's return: [loader, isLoaderAsync, isFormatText,
 *   isIfc, fixupCb].
 */
function swapToGlbLoader(viewer) {
  const loader = newGltfLoader()
  loader.type = 'glb'
  viewer.IFC.type = 'glb'
  return [loader, false /* isLoaderAsync */, false /* isFormatText */, false /* isIfc */, glbToThree]
}


/**
 * Parse a Bldrs GLB container (see `glbContainer.js`) into the shape
 * GLTFLoader normally returns: `{scenes: [Group]}` so the downstream
 * `glbToThree` fixupCb extracts the single merged Group as the model.
 *
 * Each container chunk is itself a valid GLB; we parse them one at a time
 * with the supplied GLTFLoader and add each chunk's scene to a shared
 * parent Group. Complex IFCs typically split into multiple chunks
 * because conway's GeometryConvertor segments output by buffer-size
 * budget; without this we'd render only the first chunk.
 *
 * @param {GLTFLoader} loader
 * @param {ArrayBuffer|Uint8Array} containerBytes
 * @return {Promise<{scenes: object[]}>}
 */
async function parseBldrsGlbContainer(loader, containerBytes) {
  const {chunks, mode, version} = unpackGlbContainer(containerBytes)
  glbInfo(
    `reader: unpacked Bldrs container v${version} — ${chunks.length} GLB chunk(s), ` +
    `mode=${mode || 'none'}`)
  const merged = new Group()
  for (let i = 0; i < chunks.length; i++) {
    const chunkAb = chunks[i]
    const gltf = await new Promise((resolve, reject) => {
      try {
        loader.parse(chunkAb, './', (m) => resolve(m), (err) => {
          reject(new Error(`Loader error parsing chunk ${i}: ${err}`))
        })
      } catch (e) {
        reject(new Error(`Unhandled error parsing chunk ${i}: ${e}`))
      }
    })
    if (gltf.scenes && gltf.scenes.length > 0) {
      for (const s of gltf.scenes) {
        merged.add(s)
      }
    } else if (gltf.scene) {
      merged.add(gltf.scene)
    }
  }
  return {scenes: [merged]}
}


/**
 * Walk a Three.js scene and return a one-shot summary: node count, mesh
 * count, vertex count, world-space bounds, and the magnitude of the offset
 * between the bounds center and the world origin. Used post-parse to
 * diagnose why a cached GLB might not appear in the viewport.
 *
 * @param {object} root Three.js Object3D / Group / Scene
 * @return {{nodes:number, meshes:number, vertices:number, boundsStr:string, centerOffsetStr:string, centerOffsetMag:number}}
 */
function summarizeGlbScene(root) {
  let nodes = 0
  let meshes = 0
  let vertices = 0
  const bounds = new Box3()
  bounds.makeEmpty()
  root.traverse((obj) => {
    nodes++
    if (obj instanceof Mesh) {
      meshes++
      const posAttr = obj.geometry?.attributes?.position
      if (posAttr) {
        vertices += posAttr.count
        const meshBounds = new Box3().setFromObject(obj)
        if (!meshBounds.isEmpty()) {
          bounds.union(meshBounds)
        }
      }
    }
  })
  const center = new Vector3()
  if (!bounds.isEmpty()) {
    bounds.getCenter(center)
  }
  const size = new Vector3()
  if (!bounds.isEmpty()) {
    bounds.getSize(size)
  }
  const fmt = (v) => v.toExponential(2)
  const boundsStr = bounds.isEmpty() ?
    'empty' :
    `size=(${fmt(size.x)},${fmt(size.y)},${fmt(size.z)})`
  const centerOffsetMag = center.length()
  const centerOffsetStr = bounds.isEmpty() ?
    'n/a' :
    `(${fmt(center.x)},${fmt(center.y)},${fmt(center.z)})`
  return {nodes, meshes, vertices, boundsStr, centerOffsetStr, centerOffsetMag}
}


/**
 * Build the cacheKeyArgs for a non-GitHub source kind after we've computed
 * the content sha. Returns null for an unrecognised kindLabel so the caller
 * can skip the lookup cleanly.
 *
 * @param {string} kindLabel 'local' | 'upload' | 'external'
 * @param {string} path The path/URL the loader was invoked with.
 * @param {string} contentSha Hex digest of the source bytes.
 * @return {object|null}
 */
function buildNonGitHubCacheArgs(kindLabel, path, contentSha) {
  if (kindLabel === 'local') {
    // Locally-hosted files use the path as-is for OPFS (with leading slash
    // stripped). Fallback name avoids an empty sourcePath for `/`.
    const filePath = path.replace(/^\//, '') || 'model'
    return localCacheKey({filePath, contentSha})
  }
  if (kindLabel === 'upload') {
    // Uploads carry a UUID in the path; reuse the path tail as the file name.
    const tail = path.split('/').pop() || 'upload'
    return uploadCacheKey({filePath: tail, contentSha})
  }
  if (kindLabel === 'external') {
    let pathUrl
    try {
      pathUrl = new URL(path)
    } catch (e) {
      return null
    }
    const filePath = pathUrl.pathname.replace(/^\//, '') || 'model'
    return externalCacheKey({filePath, contentSha})
  }
  return null
}

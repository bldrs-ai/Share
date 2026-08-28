import axios from 'axios'
import {Box3, BufferAttribute, Group, Mesh, Object3D, Vector3} from 'three'
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js'
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js'
import {PDBLoader} from 'three/examples/jsm/loaders/PDBLoader.js'
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js'
import {USDLoader} from 'three/examples/jsm/loaders/USDLoader.js'
import {XYZLoader} from 'three/examples/jsm/loaders/XYZLoader.js'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import * as Filetype from '../Filetype'
import {reportModelInfo, reportSourceInfo} from './loadProgress'
import {
  deleteFileFromOPFS,
  doesFileExistInOPFS,
  downloadModel,
  downloadToOPFS,
  getModelFromOPFS,
  readModelByPathFromOPFS,
  writeBase64Model,
} from '../OPFS/utils'
import {HTTP_NOT_FOUND} from '../net/http'
import {looksLikeLfsPointer} from '../net/github/lfs'
import {assertDefined} from '../utils/assert'
import {enablePageReloadApprovalCheck} from '../utils/event'
import debug from '../utils/debug'
import {navigateBaseOnModelPath, parseGitHubPath} from '../utils/location'
import {loadAllRecentFiles, updateRecentFileLastModified} from '../connections/persistence'
import {testUuid} from '../utils/strings'
import {decorateShareModel, inferModelCapabilities} from '../viewer/ShareModel'
import {attachElementSubsets, attachInstanceMapSubsets, summariseElementIdAttribute} from '../viewer/three/elementSubsets'
import {
  attachGeometryExpressIds,
  attachOccurrencePaths,
  instanceMapFromGeometry,
  instanceMapFromTriangleIds,
} from '../viewer/ifc/IfcInstanceMap'
import {dereferenceAndProxyDownloadContents} from './urls'
import BLDLoader from './BLDLoader'
import {BldrsElementPropertiesReader} from './bldrsElementProperties'
import {BldrsFaceIdsReader} from './bldrsFaceIds'
import {BldrsSpatialTreeReader} from './bldrsSpatialTree'
import {ExtBldrsPropertiesPayload} from './ExtBldrsPropertiesPayload'
import {BLDRS_TITLE_EXTRAS_KEY, exportAndCacheGlb} from './glbExport'
import glbToThree from './glb'
import {glbCacheKey} from './glbCacheKey'
import {activeArtifactSpec, isGlbBatchedActive} from './glbCompress'
import {BldrsInstanceTablesReader} from './bldrsInstanceTables'
import {hydrateBatchedModelFromInstancedGlb} from '../viewer/ifc/instancedGlbToBatchedModel'
import {isBldrsGlbContainer, unpackGlbContainer} from './glbContainer'
import {glbInfo, glbVerbose, glbWarn} from './glbLog'
import {spillModelSource} from './opfsSourceByteStore'
import {
  externalCacheKey,
  gitHubCacheKey,
  localCacheKey,
  uploadCacheKey,
} from './sourceCacheKey'
import objToThree from './obj'
import pdbToThree from './pdb'
import splatsToThree, {newSplatLoader} from './splats'
import stlToThree from './stl'
import xyzToThree from './xyz'
import {isFeatureEnabled} from '../FeatureFlags'
import useStore from '../store/useStore'
import {sha1Hex, sha1HexFromBlob} from '../utils/contentHash'
import {markIfOutOfMemory} from '../utils/oom'


// Defer to the browser's idle period when supported, otherwise to the
// next macrotask. The GLB writer is the only caller today and the
// reason: it must not run inline with the post-parse return path
// (would block the first paint + hover-pick on the freshly-rendered
// model). With `requestIdleCallback`, the writer also yields to
// camera-controls and hover-pick events during the wait. The
// `setTimeout` fallback gives us a single deferred tick; per-phase
// yields inside the writer itself still need their own awaits.
//
// `timeout` cap on `requestIdleCallback` ensures the writer eventually
// runs even on a continuously-busy main thread (a user who rotates
// the camera nonstop). 5s is past the point where a returning visitor
// would notice "cache hasn't warmed yet."
const SCHEDULE_IDLE_TIMEOUT_MS = 5_000
const LFS_POINTER_PROBE_BYTES = 256

// Matches conway's own `STORE_DETECT_PREFIX_BYTES`
// (`compat/web-ifc/ifc_api_model_passthrough_factory.js`) — the window its
// store-backed open sniffs the format in. Reading the same amount means our
// answer to "will `fromStore` take this?" comes from the same bytes it will
// look at, rather than from a smaller window that could disagree.
const STORE_FORMAT_SNIFF_BYTES = 65_536

// The formats `findLoader` routes to conway via `parseIfcWithConway`. All
// three are ISO-10303-21 part-21 files sharing one loader; only FILE_SCHEMA
// separates IFC from STEP, so the suffix is not evidence either way.
const PART21_LOADER_TYPES = new Set(['ifc', 'step', 'stp'])


/**
 * @param {Function} fn
 */
function scheduleIdleWork(fn) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, {timeout: SCHEDULE_IDLE_TIMEOUT_MS})
    return
  }
  setTimeout(fn, 0)
}


/**
 * True when Conway can parse an OPFS File through `OpenModelStream`
 * (M1b) so we never allocate a full-source ArrayBuffer.
 *
 * Decided by the file's own FILE_SCHEMA, because neither `isIfc` nor the
 * suffix is evidence of the format and both are wrong in a different
 * direction. Conway's store-backed open is IFC-only
 * (`IfcApiModelPassthroughFactory.fromStore` returns `undefined` for
 * AP214/AP203/AP242) and it reserves the model handle before it sniffs:
 *
 *   - `isIfc` is true for STEP as well, so it offered STEP files a path
 *     that always refuses them. That burned handle 0 on a model which
 *     never opened, and the buffered `OpenModelStreamed` retry parsed as
 *     handle 1 — misaddressing every Share call site that passes the
 *     scene-level id 0 (`CadView.jsx#loadModel` pins `model.modelID` to
 *     it), the GLB writer's spatial-tree and element-properties captures
 *     among them (#1776).
 *   - A suffix test is wrong the other way: `findLoader` takes
 *     `loader.type` from the filename, so an IFC payload named `.step`
 *     would be denied the windowed parse and buffer its whole source —
 *     re-introducing on a mislabelled large model exactly the
 *     hundreds-of-MB allocation M3 removed.
 *
 * An absent or unrecognised FILE_SCHEMA buffers rather than gambling: a
 * wrong "yes" costs a burned handle and a broken cache artifact, a wrong
 * "no" costs one load's memory win. Within conway's own 64 KiB sniff
 * window every real part-21 file carries FILE_SCHEMA, so that branch is
 * a corrupt-or-truncated-file path, not a format we are giving up on.
 *
 * @param {object} viewer
 * @param {string} loaderType resolved format tag, i.e. `loader.type`
 * @param {Blob} file the source handle, sniffed for its part-21 header
 * @return {Promise<boolean>}
 */
async function canOpenFromStore(viewer, loaderType, file) {
  if (!PART21_LOADER_TYPES.has(loaderType) || isFeatureEnabled('disableStreamOpen')) {
    return false
  }
  const ifcAPI = viewer?.IFC?.loader?.ifcManager?.ifcAPI
  if (typeof ifcAPI?.OpenModelStream !== 'function') {
    return false
  }
  if (file === null || file === undefined || typeof file.slice !== 'function') {
    return false
  }
  try {
    const head = await file.slice(0, STORE_FORMAT_SNIFF_BYTES).arrayBuffer()
    // Non-fatal by default, so a multi-byte sequence cut at the slice
    // boundary — or a mislabelled binary — yields replacement characters
    // rather than throwing. Both then fail the schema match below and
    // buffer, which is the outcome we want for bytes we cannot read.
    const header = new TextDecoder('utf-8').decode(new Uint8Array(head))
    // Require a schema NAME, not merely a FILE_SCHEMA entry.
    // `classifyStepFamily` answers 'ifc' whenever it cannot parse one, and
    // an empty `FILE_SCHEMA(( ))` would otherwise inherit that default and
    // send an unidentified file down the IFC-only store path.
    if (Filetype.stepSchemaName(header) === null) {
      return false
    }
    return Filetype.classifyStepFamily(header) === 'ifc'
  } catch (e) {
    debug().warn('Loader#canOpenFromStore: header sniff failed; buffering:', e)
    return false
  }
}


/**
 * Bytes for the Git LFS pointer sniff. A live File/Blob was already
 * probed via its first 256 bytes before being passed through as
 * `modelData`; don't treat the handle itself as a pointer.
 *
 * @param {ArrayBuffer|Uint8Array|Blob|string|null|undefined} data
 * @return {ArrayBuffer|Uint8Array|string|null|undefined}
 */
function probeLfsBytes(data) {
  if (data !== null && data !== undefined &&
      typeof data.size === 'number' && typeof data.slice === 'function' &&
      !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data) &&
      typeof data !== 'string') {
    return null
  }
  return data
}


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
  // Human-readable source filename for root-label composition (#1595,
  // "Scene (ISS_stationary.glb)"). For uploads the route carries only
  // the storage UUID, so resolve the original filename from the
  // recent-files entry the drop handler recorded — and capture it
  // BEFORE the blob-path rewrite below discards the UUID. For URL
  // loads (GitHub, external, locally hosted) the trailing path
  // segment is the filename.
  const sourceFileName = isUploadedFile ? uploadedDisplayFileName(path) : fileNameFromPath(path)
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
    glbVerbose('feature enabled')
  }

  if (isOpfsAvailable) {
    // OPFS is a CACHE, not a hard dependency. Any failure inside this block
    // — Safari's `InvalidStateError` on `createSyncAccessHandle`, a corrupt
    // entry from a previous failed session, a missing rename target, etc. —
    // should fall through to the direct-fetch path so the user still gets
    // their model. The cost is one cache miss this load; the next load will
    // try OPFS again from scratch.
    try {
      onProgress('Preparing file download...')
      let file
      // Per-source-kind cache-key context. Built eagerly for GitHub (we have
      // the upstream sha before download) and lazily for everything else
      // (we hash the bytes after they're in OPFS).
      let cacheKeyArgs = null
      let kindLabel = null
      // Identifies the OPFS entry this load reads, so a poisoned one
      // (see the Git LFS pointer check after the read) can be evicted.
      // Only set for GitHub sources — the only kind whose bytes can be
      // an LFS pointer.
      let opfsEntryKey = null

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
            [derefPath, shaHash, isCacheHit, isBase64] =
              await dereferenceAndProxyDownloadContents(path, accessToken, isOpfsAvailable, false)
          }
          // Captured after the re-dereference above, which can replace
          // shaHash — the key must match the one the OPFS lookup uses.
          opfsEntryKey = {filePath, shaHash, owner, repo, branch}

          // GitHub gives us a stable upstream sha *before* we download — so
          // the GLB cache lookup can happen pre-download (fastest hit path).
          if (wantGlb && shaHash) {
            cacheKeyArgs = gitHubCacheKey({owner, repo, branch, filePath, shaHash})
            glbVerbose(
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

      // Byte-source line for the load report: were the bytes served
      // from OPFS or fetched? Reported only for the kinds where
      // hit-ness is actually known here: uploads live in OPFS by
      // construction, and for GitHub the isCacheHit + doesFileExistInOPFS
      // combination above guarantees downloadModel resolved from OPFS
      // without a fetch when isCacheHit survived. downloadToOPFS
      // (local/external kinds) decides hit/miss inside the worker and
      // doesn't surface it — no line rather than a guess.
      if (isUploadedFile) {
        reportSourceInfo('Source: OPFS cache (uploaded file)')
      } else if (kindLabel === 'github') {
        reportSourceInfo(isCacheHit ?
          'Source: OPFS cache HIT (GitHub content unchanged)' :
          'Source: network download (GitHub), cached to OPFS')
      }

      // Disk handle of the *source* (IFC/STEP), captured before any GLB
      // swap. Spill pages this File; the hash/parse ArrayBuffer is a
      // separate JS copy. An OPFS File pins nothing.
      const opfsSourceFile = file

      // One sniff, two decisions: whether to hash the File in slices
      // instead of buffering it (below) and whether to hand conway the
      // File itself rather than an ArrayBuffer (further below). Computed
      // from the SOURCE handle, before any GLB cache hit can swap `file`
      // for the artifact; the second call site additionally guards on
      // `cameFromGlbCache` so a hit never takes the store path.
      const canStreamOpen = await canOpenFromStore(viewer, loader.type, opfsSourceFile)

      // Non-GitHub sources have no upstream sha. Hash the parse buffer
      // itself so we do not materialise the file twice (once for SHA-1,
      // once for Conway) — ~860 MB on PSB. sha1Hex only reads; it does
      // not copy. Store-backed opens fingerprint the File in native
      // per-slice SHA-1s (not a JS SHA-1 of the whole object). A GLB
      // cache hit still replaces modelData with the artifact.
      //
      // Self-contained try/catch: if the hash or cache lookup fails (e.g.
      // `window.crypto.subtle` absent in some jsdom test envs, OPFS sync-
      // handle hiccup partway through the lookup), we must NOT lose the
      // file we already downloaded. Falling through to the outer catch
      // would discard `file` and force an axios refetch, which then fails
      // under tests that don't mock the outbound URL. The user-visible
      // behavior on this failure path is "cache miss" — exactly what we'd
      // do anyway if the lookup returned null.
      if (wantGlb && !cacheKeyArgs && file) {
        try {
          // M1b: when Conway can parse from the OPFS File store, hash
          // the File in slices and skip the full-source ArrayBuffer —
          // ~860 MB on PSB. Older engines fall through to buffering.
          if (canStreamOpen) {
            onProgress('Hashing model...')
          } else {
            onProgress('Buffering model bytes...')
            modelData = await file.arrayBuffer()
          }
          const contentSha = modelData !== undefined ?
            await sha1Hex(modelData) :
            await sha1HexFromBlob(file)
          cacheKeyArgs = buildNonGitHubCacheArgs(kindLabel, path, contentSha)
          if (cacheKeyArgs) {
            glbVerbose(
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
              modelData = await glbFile.arrayBuffer()
            } else {
              glbInfo(`reader: ${kindLabel} cache MISS, will export after parse`)
            }
          }
        } catch (cacheLookupError) {
          glbInfo(
            `reader: ${kindLabel} cache lookup failed; treating as MISS and continuing:`,
            cacheLookupError)
          cacheKeyArgs = null
        }
      }

      if (wantGlb && isIfc && cacheKeyArgs) {
        // Spill pages from the OPFS source handle captured before any
        // GLB swap — never a cache-hit artifact.
        glbExportContext = {kindLabel, cacheKeyArgs, sourceFile: opfsSourceFile}
      }

      if (modelData === undefined && canStreamOpen && !cameFromGlbCache) {
        const head = await file.slice(0, LFS_POINTER_PROBE_BYTES).arrayBuffer()
        if (looksLikeLfsPointer(head)) {
          modelData = head
        } else {
          modelData = file
        }
      }
      if (modelData === undefined) {
        onProgress('Buffering model bytes...')
        modelData = await file.arrayBuffer()
      }
      if (opfsEntryKey !== null && looksLikeLfsPointer(probeLfsBytes(modelData))) {
        // A cache entry written before the Git LFS redirect landed
        // holds the ~130-byte pointer instead of the model, and its key
        // (pointer-blob sha + owner/repo/branch/path) is exactly the
        // key this load computes — so it would be served forever, and
        // the pointer guard further down would keep telling the user to
        // use the URL they already used. Evict it and fall through to
        // the direct fetch below, which resolves through
        // media.githubusercontent.com. Eviction is best-effort: a
        // failure only costs a re-download next time.
        //
        // Scoped to GitHub sources (the only kind that sets
        // opfsEntryKey) because they're the only ones a re-fetch can
        // repair. A pointer from anywhere else — an upload, a local
        // file — falls through to the guard below, which explains the
        // problem instead of silently re-downloading something that
        // would fail the same way.
        debug().warn(
          'Loader#load: OPFS entry holds a Git LFS pointer, not the model; ' +
          'evicting and re-fetching')
        try {
          await deleteFileFromOPFS(
            opfsEntryKey.filePath, opfsEntryKey.shaHash,
            opfsEntryKey.owner, opfsEntryKey.repo, opfsEntryKey.branch)
        } catch (evictError) {
          debug().warn('Loader#load: could not evict stale LFS pointer entry:', evictError)
        }
        // Falls through to the direct-fetch block below. Two lines above
        // already told a different story — undo both: the store's
        // opfsFile still points at the (now deleted) pointer entry, so a
        // later "Save" would write the 130-byte pointer instead of the
        // rendered model, and the report's Source line claims a cache
        // hit for bytes that are about to come from the network.
        setOpfsFile(null)
        reportSourceInfo(
          'Source: OPFS entry was a stale Git LFS pointer — evicted, re-fetching from network')
        modelData = undefined
        glbExportContext = null
        cameFromGlbCache = false
      } else if (isFormatText) {
        onProgress('Decoding model data...')
        const decoder = new TextDecoder('utf-8')
        modelData = decoder.decode(modelData)
        debug().log('Loader#load: modelData from OPFS (decoded):', modelData)
      }
    } catch (opfsError) {
      // Uploaded files (drag-drop, file picker) only exist in OPFS — there
      // is no remote URL to fall back to. Re-throw so the user sees the
      // error rather than a misleading "fall-through succeeded" outcome.
      if (isUploadedFile) {
        throw opfsError
      }
      // Bad-input errors (unparseable URL, unknown GitHub repo shape) are
      // not transient OPFS issues — falling back to axiosDownload would just
      // produce a less informative "Failed to fetch model data". Surface the
      // original error.
      if (opfsError?.message?.startsWith('Invalid URL path')) {
        throw opfsError
      }
      debug().warn(
        `Loader#load: OPFS path failed (${opfsError?.message || opfsError}); ` +
        'falling back to direct fetch. ' +
        'The OPFS cache is treated as best-effort — corrupt or browser- ' +
        'rejected entries (Safari InvalidStateError, leaked sync handles, ' +
        'half-written files from previous sessions) should not block load.')
      // A GLB writer-side artifact context only makes sense for a load that
      // actually came through the OPFS path. Drop it on fallback so we don't
      // try to associate the freshly-fetched bytes with the failed cache key.
      glbExportContext = null
      cameFromGlbCache = false
      // modelData stays undefined — falls through to the direct-fetch block
      // below, same as when `isOpfsAvailable` was false to begin with.
    }
  }

  if (modelData === undefined) {
    // Either OPFS is unavailable in this browser, or the OPFS attempt above
    // failed and we're falling back. Either way, fetch the bytes directly.
    if (isBase64) {
      // Contents API returned the file inline; no download fetch needed.
      onProgress('Decoding model data...')
      modelData = decodeBase64ModelData(derefPath, isFormatText)
      debug().log('Loader#load: modelData from inline base64 (decoded):', modelData)
    } else {
      onProgress('Downloading model data...')
      // For locally-hosted files when OPFS was available, the deref step
      // above was skipped (no GitHub Contents API dereference for `/index.ifc`),
      // so `derefPath` is unset — `path` is the URL we want.
      const fetchUrl = derefPath || path
      modelData = await axiosDownload(fetchUrl, isFormatText, onProgress)
      debug().log('Loader#load: modelData from axios download:', modelData)
    }
  }

  // Git LFS pointer guard. GitHub-hosted models go through the Contents
  // API, which rewrites LFS pointers to media.githubusercontent.com
  // before download (net/github/lfs.js). A URL that skips that
  // dereference — a raw.githubusercontent.com link pasted into the
  // search bar, or any other host serving a checked-in pointer — hands
  // us ~130 bytes of text naming the object instead of the model, and
  // the format loader then fails somewhere deep in its parser with an
  // error that never mentions LFS. Say what actually went wrong.
  if (looksLikeLfsPointer(probeLfsBytes(modelData))) {
    throw new Error(
      'This file is stored with Git LFS, so the URL returned a pointer file instead of the model. ' +
      'Open it via its github.com/<org>/<repo>/blob/<ref>/<path> URL, which resolves LFS content.')
  }

  // Provide basePath for multi-file models.  Keep the last '/' for
  // correct resolution of subpaths with '../'.
  const basePath = path.substring(0, path.lastIndexOf('/') + 1)

  // Model line for formats with no parsable STEP header (GLB/FBX/OBJ/…):
  // name, format tag and size — the normalized form's format-independent
  // core (design/new/load-log-format.md). STEP/IFC replaces this with a
  // richer header-parsed line from the engine (ON_MODEL_INFO) as soon as
  // its header parses.
  let formatTag
  try {
    formatTag = Filetype.getValidExtension(path)?.toUpperCase()
  } catch {
    // Extension-less upload paths — the loader was already resolved by
    // content sniffing in findLoader; the model line just omits the tag.
  }
  reportModelInfo({
    fileName: path.substring(path.lastIndexOf('/') + 1) || path,
    schema: formatTag,
    byteLength: modelData?.byteLength ?? modelData?.length ?? modelData?.size,
  })

  // readModel throws on any falsy model (surfacing viewer.IFC.ifcLastError
  // for IFC loads, or a generic error otherwise), so `model` is always
  // truthy past this point — no post-call null check is needed here.
  let model
  try {
    model = await readModel(loader, modelData, basePath, isLoaderAsync, isIfc, viewer, fixupCb, onProgress)
  } catch (e) {
    throw markIfOutOfMemory(e)
  }

  // Conway's handle for THIS parse, latched before the model leaves
  // `load()`. Two different numbers travel under the name "modelID" and
  // they are only equal when Conway handed us handle 0:
  //
  //   - the scene-level id every ShareViewer/CadView call site passes,
  //     which `CadView.jsx#loadModel` pins to 0 on the model object
  //     the moment `load()` resolves (its issue-#91 hack), and
  //   - Conway's engine handle, which `decorateConwayDirectIfcModel`
  //     wrote onto the same `model.modelID` property a moment ago.
  //
  // The idle GLB writer below runs after that overwrite, so reading
  // `model.modelID` there yielded the scene id, not the engine handle —
  // and a capture aimed at a handle Conway never opened comes back
  // empty, so the artifact cached with no NavTree and no Properties
  // (#1776). `canOpenFromStore` now keeps the two numbers equal in
  // practice; latching here keeps the writer correct even when they
  // diverge again (an IFC whose windowed open throws and falls back).
  const engineModelID = typeof model.modelID === 'number' ? model.modelID : 0

  // Batched-native artifact hydration (view-140 S9, `?feature=glbBatched`):
  // GLTFLoader parsed the EXT_mesh_gpu_instancing nodes to InstancedMeshes
  // and the tables plugin stashed BLDRS_instance_tables on userData —
  // rebuild the decorated BatchedMesh model the cache-miss path produces,
  // so highlight / isolate / residency / display controls work on reload.
  // Fail-soft: a null hydration keeps the GLTFLoader model, which still
  // renders correctly (three draws the instancing natively) — degraded to
  // table-less, never wrong. Runs before convertToShareModel so the
  // hydrated model is what every downstream decoration sees.
  if (cameFromGlbCache && isGlbBatchedActive() && model?.userData?.bldrsInstanceTables) {
    const hydrateScene =
      typeof viewer?.context?.getScene === 'function' ? viewer.context.getScene() : null
    const hydrated = hydrateBatchedModelFromInstancedGlb(model, {scene: hydrateScene})
    if (hydrated) {
      glbInfo('reader: hydrated batched-native artifact to a BatchedMesh model')
      model = hydrated
    }
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
    convertToShareModel(model, viewer, {fileName: sourceFileName})
    viewer.IFC.addIfcModel(model)
    viewer.IFC.loader.ifcManager.state.models.push(model)
  }

  // Used for GA stats
  model.type = loader.type

  // ShareModel decoration (see src/viewer/ShareModel.js): adds
  // `format` + `capabilities` so call-sites can branch on intrinsic
  // model capability instead of guessing from `viewer.IFC.type`.
  decorateShareModel(model, loader.type)

  // Runtime capability augmentation. The format default for 'glb'
  // is all-off, but a cache-hit GLB carries the per-vertex
  // `expressID` attribute preserved from the original IFC parse —
  // it supports `expressIdPicking` even though its format is 'glb'.
  // `inferModelCapabilities` walks the geometry and promotes the
  // flag when the attribute is actually present. Additive only —
  // never demotes a format-default capability.
  Object.assign(model.capabilities, inferModelCapabilities(model))

  // For models with per-vertex element IDs but no `ifcSubsets`
  // capability (i.e., cache-hit GLB — IFC parser state is not
  // present, so web-ifc-three's createSubset cannot run), attach
  // our own `model.createSubset` / `removeSubset` methods backed
  // by the per-vertex attribute. Matches the shape proposed for
  // Phase 3's `IfcModel#createSubset`
  // (design/new/viewer-replacement.md §3b.i) so the same call-sites
  // work against both implementations.
  //
  // Conway-direct models (instancePicking) get the instance-map-
  // aware variant — same return shape (`Mesh[]`), but subsets are
  // built via each child mesh's `IfcInstanceMap` rather than scanning
  // per-vertex `expressID`. The instance maps themselves are attached
  // in the next block (cache-hit restoration); the createSubset
  // closure resolves them lazily at invoke time, so the attach-here-
  // populate-below order is fine.
  // BatchedMesh path excluded: its geometry carries no per-vertex `expressID`
  // (IDs live in the per-batch `instanceParents` table), so the per-vertex
  // `attachElementSubsets` would build empty subsets. `buildBatchedConwayModel`
  // already attached the batch-aware `createSubset` (`attachBatchedSubsets`) —
  // don't clobber it.
  if (model.capabilities.expressIdPicking && !model.capabilities.ifcSubsets &&
      !model.capabilities.batchedPicking) {
    const scene = typeof viewer.context?.getScene === 'function' ? viewer.context.getScene() : null
    if (model.capabilities.instancePicking) {
      attachInstanceMapSubsets(model, scene)
    } else {
      attachElementSubsets(model, scene)
    }
    // Diagnostic: how many distinct per-vertex element IDs are in
    // this model? Compared against the IFC's true element count, a
    // gap signals lost instance identity through write/read — most
    // commonly because the original IFC used mapped-item / type-
    // shared representations (multiple visible positions sharing
    // one element express ID), in which case selecting any of those
    // positions correctly highlights every other position too.
    const stats = summariseElementIdAttribute(model)
    glbVerbose(
      `reader: per-vertex element-IDs — ${stats.uniqueIds} unique across ` +
      `${stats.vertices} vertices in ${stats.meshes} meshes`)
  }

  // Cache-hit picking restoration: per-mesh IfcInstanceMaps from
  // BLDRS_face_ids / per-vertex ids, then the (order-preserving) BVH
  // build. Extracted for direct unit testing of the triangle-order
  // alignment invariant; see restoreCacheHitPicking below.
  restoreCacheHitPicking(model, cameFromGlbCache)

  // Fire-and-forget: serialize the rendered model to GLB and stash in
  // OPFS so the next load of the same source can skip the IFC parse.
  // Triggered for every source kind (github, local, upload, external)
  // when the `glb` feature flag is on. Failures are logged but never
  // thrown — the source is already on screen; this is cache warm-up only.
  // Design: design/new/glb-model-sharing.md §"Pipelines/A. Originator".
  // `ifcManager` is captured from the live IFC parser state so the
  // writer can pull `getSpatialStructure(...)` into a BLDRS_spatial_tree
  // glTF extension — without that, cache-hit GLBs have no NavTree
  // (the cache-hit path has no IFC parser). Non-IFC sources have no
  // manager and the writer captures nothing; cache miss/hit both work.
  //
  // **Scheduling.** The writer is deferred to a macrotask (and then
  // `requestIdleCallback` when available) so it doesn't run inline with
  // the post-parse return path. Without the defer, the GLTFExporter +
  // property-capture phases would block the main thread immediately
  // before the user can rotate/zoom/hover on the freshly-rendered
  // model — and on big IFCs that block extends past the first hover
  // tick. With the defer, the next paint + the user's first frame of
  // interaction land before the writer kicks off; the writer then runs
  // when the browser is idle (or, on older browsers without
  // requestIdleCallback, on the next macrotask).
  //
  // **In-flight flag.** `isCacheWriteInFlight` is observable from React
  // (see Properties.jsx) so the UI can render a "Caching for next
  // load…" affordance. The flag captures the entire writer lifetime
  // (set before scheduling, cleared after the writer settles either
  // way) — clears only when the actual write finishes, not when the
  // call returns. Failures clear the flag too; the writer's `.finally`
  // is the source of truth.
  if (glbExportContext) {
    glbVerbose('writer: scheduling export, kind =', glbExportContext.kindLabel)
    useStore.getState().setIsCacheWriteInFlight(true)
    const runWriter = () => {
      exportAndCacheGlb({
        model,
        kindLabel: glbExportContext.kindLabel,
        cacheKeyArgs: glbExportContext.cacheKeyArgs,
        ifcManager: viewer?.IFC?.loader?.ifcManager ?? null,
        modelID: engineModelID,
      }).finally(() => {
        useStore.getState().setIsCacheWriteInFlight(false)
        // The writer's property/tree captures were the LAST load-time
        // sweeps that read the parsed source synchronously — from here
        // on, everything (Properties panel, psets, on-demand subtree
        // props) goes through Conway's async APIs, which page ranges
        // in on demand. So this is the one safe point to release
        // Conway's resident copy of the raw source (100s of MB on
        // large models) and back later reads with the OPFS File the
        // model was parsed from. Cache-hit GLB loads never get here
        // (no writer is scheduled) — nothing to spill. Fail-soft: any
        // guard failure keeps the resident buffer (pre-spill behavior).
        spillModelSource(
          viewer?.IFC?.loader?.ifcManager?.ifcAPI, engineModelID, glbExportContext.sourceFile)
        // Same safe point, wasm-side twin of the source spill: the
        // scene is built and the GLB written, so nothing reads conway's
        // native geometry again — free it (per-model) so repeated loads
        // in one tab reuse the wasm pages instead of stacking whole
        // model scenes until the tab crashes. Feature-detected;
        // burn-in gated with the demand path.
        try {
          const releaseAPI = viewer?.IFC?.loader?.ifcManager?.ifcAPI
          if (isFeatureEnabled('demandGeometry') &&
              typeof releaseAPI?.ReleaseModelGeometry === 'function') {
            // eslint-disable-next-line new-cap
            const released = releaseAPI.ReleaseModelGeometry(engineModelID)
            glbVerbose('writer: native geometry released =', released)
          }
        } catch (e) {
          glbVerbose('writer: native geometry release failed (kept):', e)
        }
      })
    }
    scheduleIdleWork(runWriter)
  }

  return model
}


/**
 * Restore picking state for a cache-hit GLB model: rebuild per-mesh
 * `IfcInstanceMap`s from `BLDRS_face_ids` (or per-vertex ids), reattach
 * the persisted STEP occurrence/geometry tables, then build the BVHs.
 * Extracted from `load()` so the triangle-order alignment between the
 * face_ids-built maps and the raycast/subset consumers is unit-testable:
 * the BVH build MUST NOT permute `geometry.index` (see the indirect note
 * inside), or every triangle-keyed lookup after it silently scrambles.
 *
 * @param {object} model the converted Share model (Mesh or Group)
 * @param {boolean} cameFromGlbCache true when the model was hydrated from
 *   the OPFS GLB cache (gates the BVH build; live parses build their own)
 */
export function restoreCacheHitPicking(model, cameFromGlbCache) {
  // Restore per-mesh `IfcInstanceMap` on cache-hit Conway-direct
  // models. The GLB write captured per-vertex `instanceID` alongside
  // `expressID`; `inferModelCapabilities` flipped `instancePicking`
  // when both are present. Build a map per child Mesh from its own
  // geometry attributes.
  //
  // Why per-mesh, not single: GLTFExporter splits one indexed mesh
  // into N primitives — one per `geometry.groups[]` entry — and
  // duplicates shared vertices. So the cache-write turn this:
  //   ifcModel (1 Mesh, geometry with M material groups, V verts)
  // into this:
  //   Group containing M child Meshes, each with its own vertex
  //   subset + its own index buffer. Total V_cache ≈ V × avg_share_factor.
  //
  // On read, each child Mesh has its own copy of `expressID` +
  // `instanceID` per-vertex; the instance IDs are globally unique
  // across the meshes (GLTFExporter doesn't renumber attributes when
  // splitting). So one IfcInstanceMap per child Mesh, attached as
  // `mesh.instanceMap`, is the right shape. ShareViewer.setSelection
  // and setInstanceSelection traverse the model and build subsets
  // from each map. (Cache-miss is the degenerate single-Mesh case:
  // `ifcModel` is itself the Mesh, traversal visits one node, same
  // code path produces the same result.)
  //
  // Skip when a mesh already has an instanceMap attached — the
  // Conway-direct cache-miss path attaches one directly during the
  // parse swap; this block is only for cache-hit restoration.
  // Cache-hit IfcInstanceMap restoration. Three sources, in order of
  // preference:
  //   1. BLDRS_face_ids extension (`userData.bldrsFaceIds.perPrimitive`)
  //      — per-triangle expressID + instanceID arrays untouched by
  //      compression. The source of truth when present; immune to
  //      DRACO quantization and Meshopt vertex welding.
  //   2. Per-vertex `_EXPRESSID` / `_INSTANCEID` attributes — the
  //      legacy fallback for cache artifacts that predate face_ids.
  //      Safe when no compression was applied (current default for
  //      IFC GLBs); unreliable when DRACO/Meshopt ran.
  //   3. Nothing — geometry-only model with no IFC IDs (drag-dropped
  //      GLB / OBJ / etc.); skip the map.
  //
  // Walk meshes in traversal order. Match each Mesh to its face_ids
  // perPrimitive entry by primitive index (writer's
  // `capturePerTriangleIds` iterates `json.meshes[].primitives[]` in
  // the same depth-first order GLTFLoader produces, so positional
  // matching holds for both single-mesh and merged-container GLBs).
  if (model.capabilities.instancePicking ||
        model.userData?.bldrsFaceIds) {
    const faceIdsPerPrimitive = model.userData?.bldrsFaceIds?.perPrimitive ?? null
    // Global STEP occurrence-path table (index = synthetic instance id),
    // persisted by the writer so a cache-hit STEP model can rebuild the
    // per-occurrence tables the cache-miss instance map carried. Null for
    // IFC / pre-occurrence artifacts. Read before the userData is freed below.
    const occurrencePaths = model.userData?.bldrsFaceIds?.occurrencePaths ?? null
    // Global per-instance geometry (solid) express-id table, persisted the
    // same way — restores per-solid selection of multibody STEP parts on
    // cache-hit. Null for IFC / pre-0.10.0 artifacts.
    const geometryExpressIds = model.userData?.bldrsFaceIds?.geometryExpressIds ?? null
    // Per-vertex IDs are only trustworthy on uncompressed artifacts.
    // DRACO quantises integer attributes and Meshopt welds shared
    // vertices — both silently corrupt _EXPRESSID / _INSTANCEID. We
    // gate the legacy fallback on `bldrsCompressionMode == null`
    // (set by parseBldrsGlbContainer above). When face_ids exists
    // and fails its sanity check on a compressed artifact, we'd
    // rather drop picking on that mesh than return wrong selections.
    const compressionMode = model.userData?.bldrsCompressionMode ?? null
    const perVertexTrusted = compressionMode === null
    let meshIndex = 0
    let attached = 0
    let viaFaceIds = 0
    let skippedCompressedNoFaceIds = 0
    let totalInstances = 0
    const allParents = new Set()
    model.traverse((obj) => {
      if (!obj.isMesh) {
        return
      }
      if (obj.instanceMap) {
        meshIndex++
        return
      }
      let map = null
      const faceIdsEntry = faceIdsPerPrimitive ? faceIdsPerPrimitive[meshIndex] : null
      if (faceIdsEntry && faceIdsEntry.expressIds) {
        // Sanity 1: per-triangle array length must match the geometry's
        // triangle count.
        // Sanity 2: decode canary — `firstExpressId` recorded at capture
        // time must match `expressIds[0]` after Base64 decode. This is
        // self-referential (it compares the payload against itself), so it
        // only guards decode integrity, NOT writer↔reader primitive-order
        // pairing.
        // Sanity 3: order cross-check — when the per-vertex ids are
        // trustworthy (uncompressed artifact), triangle 0's per-vertex
        // expressID must equal the table's first entry. Unlike the decode
        // canary this reads the MESH's own data, so it genuinely catches a
        // primitive-order divergence between `capturePerTriangleIds`'
        // `json.meshes[].primitives[]` walk and GLTFLoader's traversal
        // order. (Compressed artifacts can't be cross-checked — DRACO/
        // Meshopt corrupt the per-vertex ids — so they rely on 1+2 alone.)
        const idxCount = obj.geometry?.index?.count ?? 0
        const expectedTriCount = (idxCount / 3) | 0
        const canaryOk = faceIdsEntry.firstExpressId === null ||
            faceIdsEntry.firstExpressId === faceIdsEntry.expressIds[0]
        const attrExpr = perVertexTrusted ? obj.geometry?.attributes?.expressID : null
        const geomIndex = obj.geometry?.index
        const crossOk = !attrExpr || !geomIndex || geomIndex.count === 0 ||
            faceIdsEntry.expressIds[0] === attrExpr.getX(geomIndex.getX(0))
        if (faceIdsEntry.expressIds.length === expectedTriCount && canaryOk && crossOk) {
          map = instanceMapFromTriangleIds(
            faceIdsEntry.expressIds, faceIdsEntry.instanceIds, {geometry: obj.geometry})
          viaFaceIds++
        } else if (!canaryOk || !crossOk) {
          // A failure here leaves `map` null, so the per-vertex fallback
          // below still recovers picking when the attrs are trusted (the
          // cross-check only runs in that case); a compressed artifact
          // genuinely loses picking on this mesh.
          const which = canaryOk ? 'order cross-check vs per-vertex ids' : 'decode canary'
          const recovery = perVertexTrusted ?
            'falling back to per-vertex attributes' :
            'skipping picking on this mesh'
          glbWarn(
            `reader: face_ids ${which} failed on mesh ${meshIndex} ` +
              `(payload first expressID ${faceIdsEntry.expressIds[0]}, ` +
              `recorded ${faceIdsEntry.firstExpressId}, ` +
              `geometry ${attrExpr && geomIndex ? attrExpr.getX(geomIndex.getX(0)) : 'n/a'}); ` +
              `${recovery}`)
        } else {
          const recovery = perVertexTrusted ?
            'falling back to per-vertex attributes' :
            'skipping picking on this mesh (compressed, per-vertex IDs are corrupted)'
          glbWarn(
            `reader: face_ids triangle count mismatch on mesh ${meshIndex} ` +
              `(face_ids ${faceIdsEntry.expressIds.length}, geometry ${expectedTriCount}); ${recovery}`)
        }
      }
      if (!map && obj.geometry?.attributes?.instanceID?.count > 1) {
        if (perVertexTrusted) {
          map = instanceMapFromGeometry(obj.geometry)
        } else if (!faceIdsEntry) {
          // Compressed artifact with no face_ids entry — the per-vertex
          // attrs exist but are corrupted by DRACO/Meshopt. Skip.
          skippedCompressedNoFaceIds++
        }
      }
      if (map) {
        // Restore STEP per-occurrence tables from the persisted global
        // table (no-op for IFC / when absent), so scene↔NavTree selection
        // keys on the occurrence path — not the part-type id shared across
        // every reuse — on cache-hit exactly as it does on cache-miss.
        if (occurrencePaths) {
          attachOccurrencePaths(map, occurrencePaths)
        }
        if (geometryExpressIds) {
          attachGeometryExpressIds(map, geometryExpressIds)
        }
        obj.instanceMap = map
        attached++
        totalInstances += map.instanceCount
        for (const pid of map.parentExpressIdToInstanceIds.keys()) {
          allParents.add(pid)
        }
      }
      meshIndex++
    })
    if (attached > 0) {
      glbVerbose(
        `reader: restored IfcInstanceMap × ${attached} mesh(es) — ` +
          `${totalInstances} instances under ${allParents.size} IFC products ` +
          `(${viaFaceIds} via BLDRS_face_ids, ${attached - viaFaceIds} via per-vertex)`)
    }
    if (skippedCompressedNoFaceIds > 0) {
      glbWarn(
        `reader: skipped picking on ${skippedCompressedNoFaceIds} mesh(es) — ` +
          `compressed (${compressionMode}) artifact with no BLDRS_face_ids coverage; ` +
          'per-vertex IDs would be corrupted')
    }
    // Free the per-triangle ID arrays now that IfcInstanceMap owns its
    // own copies. For a 2.84M-triangle Snowdon model this reclaims
    // ~22MB of JS heap that would otherwise be held for the life of
    // the scene.
    if (model.userData?.bldrsFaceIds) {
      delete model.userData.bldrsFaceIds
    }
  }

  // BVH build for fast picking on cache-hit GLB. The Conway-direct
  // cache-MISS path already does this inside
  // `decorateConwayDirectIfcModel` (Slice 5b), but cache-HIT meshes
  // come straight off GLTFLoader and never see a `computeBoundsTree()`
  // call. Without a BVH, the per-frame hover raycast falls back to
  // `Mesh.prototype.raycast`'s O(triangles) brute force — on a ~3M-tri
  // Snowdon split into 85 child meshes that drops hover-pick to ~1 FPS.
  // With BVH, the same raycast is O(log N) per mesh and stays at 60 FPS.
  //
  // `BufferGeometry.prototype.computeBoundsTree` is the monkey-patch
  // wit-three's `initializeMeshBVH` already installed at viewer init
  // (`web-ifc-three/IFCLoader.js#initializeMeshBVH` writes it onto
  // the prototype + replaces `Mesh.prototype.raycast` with
  // `acceleratedRaycast`). Cache-hit GLB meshes inherit the patched
  // prototype but need their own `boundsTree` built per geometry.
  //
  // Gated on `cameFromGlbCache` so live IFC parses (which build
  // their own BVH in `decorateConwayDirectIfcModel`) don't double-
  // build.
  if (cameFromGlbCache) {
    const bvhStartMs = Date.now()
    let bvhBuilt = 0
    let bvhTris = 0
    model.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) {
        return
      }
      // Skip if already has a BVH (defensive — shouldn't happen on
      // cache-hit but won't rebuild if it does).
      if (obj.geometry.boundsTree) {
        return
      }
      if (typeof obj.geometry.computeBoundsTree !== 'function') {
        return
      }
      try {
        // `indirect` is required for correctness here, not a perf knob. The
        // default build sorts `geometry.index` in place (spatial leaf order),
        // but the per-triangle `IfcInstanceMap`s were just built from
        // `BLDRS_face_ids` in the GLB's ORIGINAL triangle order (the attach
        // block above). A permuting build breaks every triangle-keyed
        // consumer afterwards: a pick's `faceIndex` resolves to the wrong
        // instance/element (an i-beam reads as a bolt), and the selection
        // subsets draw the table's triangle ranges against the permuted
        // buffer — highlighting spatially-nearby OTHER parts instead of the
        // picked one. Indirect mode keeps the index untouched (the BVH holds
        // its own indirection buffer) and reports `faceIndex` in original
        // order, so tables, raycasts and subsets all stay aligned. The
        // cache-MISS path never had this problem: `decorateConwayDirectIfcModel`
        // rebuilds its map FROM the geometry after its (permuting) build.
        obj.geometry.computeBoundsTree({indirect: true})
        bvhBuilt++
        const idx = obj.geometry.index
        bvhTris += idx ? (idx.count / 3) : 0
      } catch (e) {
        glbInfo(`reader: computeBoundsTree failed for one mesh; skipping:`, e)
      }
    })
    if (bvhBuilt > 0) {
      glbVerbose(
        `reader: built BVH × ${bvhBuilt} mesh(es) — ` +
          `${bvhTris.toLocaleString()} triangles in ${Date.now() - bvhStartMs}ms`)
    }
  }
}


/**
 * Trailing path segment of a URL or filepath, query/hash stripped and
 * URI-decoded — the "filename" a user would recognize from the address
 * bar. Returns null when there is no usable segment (trailing slash,
 * empty input, malformed %-escape).
 *
 * @param {string} path URL or filepath
 * @return {string|null}
 */
function fileNameFromPath(path) {
  if (typeof path !== 'string' || path === '') {
    return null
  }
  const noQuery = path.split(/[?#]/)[0]
  const segment = noQuery.substring(noQuery.lastIndexOf('/') + 1)
  if (segment === '') {
    return null
  }
  try {
    return decodeURIComponent(segment)
  } catch {
    // Malformed percent-escape — the raw segment still names the file
    // better than nothing.
    return segment
  }
}


/**
 * Original filename for an uploaded (drag-drop / file-picker) model.
 * The upload flow stores the file in OPFS under a UUID and records the
 * user's original filename in the recent-files entry keyed by that
 * UUID (`utils/dragAndDrop.js#onWritten` → `addRecentFileEntry`).
 * Falls back to the UUID-based storage name when the entry is missing
 * (cleared localStorage, direct navigation to a stale /v/new/ URL).
 *
 * @param {string} uploadPath the pre-blob-rewrite path whose trailing
 *   segment is the upload's storage id (`<uuid>.<type>`)
 * @return {string|null}
 */
function uploadedDisplayFileName(uploadPath) {
  const storageId = fileNameFromPath(uploadPath)
  if (storageId === null) {
    return null
  }
  try {
    const entry = loadAllRecentFiles().find((f) => f.id === storageId)
    if (entry && typeof entry.name === 'string' && entry.name !== '') {
      return entry.name
    }
  } catch {
    // localStorage unavailable (some embeds / private modes) — the
    // storage id is still a serviceable display name.
  }
  return storageId
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


// Hard cap on the length of a cache-hit title we'll accept. The
// title flows from `scenes[0].extras.bldrsTitle` → `model.userData` →
// `model.name` → React Helmet `<title>`. Even though Helmet escapes
// text, an absurdly long title is a DoS-lite (jitter on title-bar
// rendering, log noise). 200 chars comfortably covers real IFC
// project names without giving the cache file room to misbehave.
const MAX_CACHED_TITLE_LENGTH = 200


// Pattern matching characters we strip from a cache-hit title before
// promoting it. Defense-in-depth — the rendering layer (React Helmet
// → `document.title`) already escapes text, but cached files come
// from a write boundary we don't fully trust (see
// design/new/glb-model-sharing.md §"Validation and trust"). Filter:
//   - ASCII control characters (U+0000–U+001F, U+007F): nulls,
//     newlines, tabs; could break log lines or other consumers that
//     render the title in non-escaped contexts.
//   - Bidi-override characters (U+202A–U+202E, U+2066–U+2069): used
//     in spoofing attacks ("looks-like-ProjectA.ifc-but-is-evil.exe").
//   - `<` and `>`: belt-and-suspenders against any consumer that
//     forgets to escape; lets the title still read as plain text.
// eslint-disable-next-line no-control-regex
const BLDRS_TITLE_STRIP_PATTERN = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069<>]/g


/**
 * Return a file-derived name (cache-hit title, glTF scene/node name…)
 * safe for promotion to `model.name` / `Name.value`. Strips control /
 * bidi / markup characters, trims whitespace (a whitespace-only name
 * carries no signal and would otherwise block downstream fallbacks),
 * caps length, treats empty and non-string inputs as "no usable name"
 * by returning null.
 *
 * @param {*} raw value from `model.userData.bldrsTitle`, `Object3D.name`, …
 * @return {string|null}
 */
function sanitizeCachedTitle(raw) {
  if (typeof raw !== 'string' || raw === '') {
    return null
  }
  const stripped = raw.replace(BLDRS_TITLE_STRIP_PATTERN, '').trim()
  if (stripped === '') {
    return null
  }
  return stripped.length > MAX_CACHED_TITLE_LENGTH ?
    stripped.slice(0, MAX_CACHED_TITLE_LENGTH) :
    stripped
}


// Exported for tests so they can exercise the sanitizer surface
// without going through the full convertToShareModel path.
export {sanitizeCachedTitle as __sanitizeCachedTitleForTest}


/**
 * TODO(pablo): this is a temporary harness to add some stubs to the loaded mesh
 * to have it not crash helpers for the main viewer.
 *
 * @param {Mesh} model
 * @param {object} viewer
 * @param {object} [opts]
 * @param {string|null} [opts.fileName] source filename for root-label
 *   composition (#1595) — e.g. "ISS_stationary.glb". See the root
 *   naming block below.
 * @return {Mesh}
 */
export function convertToShareModel(model, viewer, {fileName = null} = {}) {
  let objIdSerial = 0
  // Whether we found per-vertex IFC expressIDs preserved through the
  // GLB cache round-trip. GLTFExporter renames our `expressID` attribute
  // to `_EXPRESSID` (custom attr → `_`-prefixed, uppercase) on write;
  // GLTFLoader lowercases unknown attribute names on read, so the
  // attribute lands at `geometry.attributes._expressid`. When we see
  // it, we rename back to `expressID` so web-ifc-three's stock
  // `IFCLoader#getExpressId` (which reads `attributes.expressID` at
  // `index.array[3 * faceIndex]`) works without modification — element-
  // level picking is restored on cache-hit models. See
  // design/new/glb-model-sharing.md §"Picking granularity".
  let foundPreservedExpressId = false
  // Same trip for the Conway-direct path's per-vertex `instanceID`
  // attribute (synthetic IfcInstanceMap instance per-PlacedGeometry).
  // Written by GLTFExporter as `_INSTANCEID`, returned by GLTFLoader as
  // `_instanceid`. Rename back so `inferModelCapabilities` can flip
  // `instancePicking` on and `instanceMapFromGeometry` can derive the
  // map from per-vertex attributes — no custom glTF extension needed,
  // three.js's auto-renaming carries the data through verbatim. See
  // design/new/viewer-replacement.md §3b.ii ("For the GLB cache").
  let foundPreservedInstanceId = false

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
    // Standard scenegraph node naming (#1595): three.js loaders carry
    // the source file's node names on `Object3D.name` — GLTFLoader
    // copies glTF `nodes[i].name` (e.g. NASA's ISS_stationary.glb
    // names every node), OBJLoader uses `o`/`g` group names. Surface
    // them through the IFC-shaped `Name`/`LongName` that `reifyName`
    // (NavTree labels) and the Properties panel read, keeping the
    // legacy 'Object' placeholder only for unnamed nodes. Sanitized
    // like the cached title — node names cross the same untrusted-file
    // boundary. Root (depth 0) naming is handled below, after the
    // cache-title hydration that must take precedence.
    if (depth > 0) {
      const nodeName = sanitizeCachedTitle(obj3d.name) ?? 'Object'
      obj3d.Name = obj3d.Name || {value: nodeName}
      obj3d.LongName = obj3d.LongName || {value: nodeName}
    }
    const id = objIdSerial++
    let hasPerVertex = false
    if (obj3d.geometry) {
      // Fast path: this geometry came from a GLB roundtrip and still
      // has the per-vertex IFC expressID under the `_EXPRESSID` →
      // `_expressid` GLTFLoader-lowercased name. Rename back to
      // `expressID` and skip the mesh-level synthetic write below.
      const preserved = obj3d.geometry.attributes._expressid
      if (preserved && preserved.count > 1) {
        obj3d.geometry.setAttribute('expressID', preserved)
        delete obj3d.geometry.attributes._expressid
        foundPreservedExpressId = true
        hasPerVertex = true
      } else {
        const ids = new Int8Array(1)
        ids[0] = id
        const expressIdAttr = new BufferAttribute(ids, 1)
        // eslint-disable-next-line no-empty-function
        expressIdAttr.onUpload(() => {})
        obj3d.geometry.attributes.expressID = expressIdAttr
      }
      // Independent restore of the per-vertex `instanceID` attribute.
      // The Conway-direct path emits this alongside `expressID`;
      // GLTFExporter serialises it as `_INSTANCEID` (custom attr →
      // `_`-prefixed, uppercase), GLTFLoader returns it as
      // `_instanceid`. Promote back so `inferModelCapabilities` can
      // flip `instancePicking` on and `instanceMapFromGeometry` (run
      // by the cache-hit decoration block in `Loader#load`) can
      // reconstruct the full IfcInstanceMap from per-vertex data
      // alone — no custom glTF extension needed. A cache-hit GLB
      // carrying both `expressID` and `instanceID` was originated
      // under the Conway-direct path; one carrying only `expressID`
      // came from a pre-Conway-direct parse. Same reader handles
      // both; capability inference decides which features apply.
      // See design/new/viewer-replacement.md §3b.ii ("For the GLB cache").
      const preservedInst = obj3d.geometry.attributes._instanceid
      if (preservedInst && preservedInst.count > 1) {
        obj3d.geometry.setAttribute('instanceID', preservedInst)
        delete obj3d.geometry.attributes._instanceid
        foundPreservedInstanceId = true
      }
    }
    // Only set the mesh-level `obj3d.expressID` serial when the geometry
    // does NOT carry per-vertex IDs. Otherwise leave it undefined so
    // CadView's click handler takes the per-vertex branch
    // (`geom.attributes.expressID.getX(geoIndex[3 * faceIndex])`) instead
    // of the wrong fallback that treats `mesh.expressID` as the answer
    // for every face of the mesh.
    if (!hasPerVertex) {
      obj3d.expressID = Number.isSafeInteger(obj3d.expressID) ? obj3d.expressID : id
    }

    if (obj3d.children && obj3d.children.length > 0) {
      obj3d.children.forEach((m) => recursiveDecorate(m, depth + 1))
    }
  }

  recursiveDecorate(model)

  // Override for root
  debug().log('Overriding project root name')
  model.type = model.type || 'IFCPROJECT'
  // Cache-hit title hydration. The writer stamps the IFC project
  // title (e.g. "Momentum") into `scenes[0].extras[BLDRS_TITLE_EXTRAS_KEY]`;
  // three.js GLTFLoader auto-copies scene extras into
  // `scene.userData`, so a cache-hit GLB lands here with the title
  // available at `model.userData[BLDRS_TITLE_EXTRAS_KEY]`. We sanitize
  // (strip control / bidi / markup chars, cap length — see
  // `sanitizeCachedTitle`) because the cache file is an untrusted
  // boundary in the originator-share design, then promote to
  // `model.Name`/`model.LongName`/`model.name` BEFORE the
  // `${mimeType} model` fallback below would clobber them — otherwise
  // every cache-hit page title degrades to "glb model" even though
  // the original IFC had a meaningful project name. Live IFC parses
  // miss this branch (no extras on userData) and fall through to the
  // existing Name/LongName logic, which is fed by the IFC parser
  // upstream.
  //
  // Precedence: if the IFC parser already set `model.name` (the live-
  // parse path does, via `statsApi.projectName`), THAT wins — we leave
  // every title-related field as-is. Filling only Name/LongName from
  // a stale `userData.bldrsTitle` while keeping a different
  // `model.name` would split the source of truth between the page
  // title (`name`) and other consumers reading `LongName.value`. A
  // pre-set `model.name` means upstream already decided; trust it.
  // convertToShareModel only runs on the non-IFC branch of Loader#load,
  // so a pre-set `model.name` here always came from the loaded file
  // (GLTFLoader copies the glTF `scenes[n].name` onto the returned
  // scene; OBJLoader similarly). Scrub it with the same sanitizer as
  // the cached title before it reaches the page <title> / NavTree —
  // a name that sanitizes to nothing is treated as absent, which
  // also re-enables the cached-title promotion below.
  if (typeof model.name === 'string' && model.name !== '') {
    model.name = sanitizeCachedTitle(model.name) ?? ''
  }
  const cachedTitle = sanitizeCachedTitle(model.userData?.[BLDRS_TITLE_EXTRAS_KEY])
  const liveNameAlreadySet = (typeof model.name === 'string' && model.name !== '')
  let titleIsCacheStamped = false
  if (cachedTitle && !liveNameAlreadySet) {
    model.Name = model.Name || {value: cachedTitle}
    model.LongName = model.LongName || {value: cachedTitle}
    model.name = cachedTitle
    titleIsCacheStamped = true
  }
  // Standard glTF root naming (#1595): authored scene names are often
  // generic exporter defaults (Blender's "Scene"), so compose the root
  // label as "<sceneName> (<fileName>)" — or the filename alone when
  // the file has no scene name — matching the three.js editor's use of
  // the import filename. Skipped for IFC-derived cache artifacts,
  // where the title IS the real project name: either the bldrsTitle
  // promotion above just ran, or (new-writer artifacts) the scene name
  // GLTFLoader handed us equals the stamped bldrsTitle — appending the
  // source filename there would diverge from the live-parse title.
  const sourceFileName = sanitizeCachedTitle(fileName)
  const titleIsIfcProjectName =
    titleIsCacheStamped || (cachedTitle !== null && model.name === cachedTitle)
  if (sourceFileName && !titleIsIfcProjectName) {
    model.name = (model.name && model.name !== sourceFileName) ?
      `${model.name} (${sourceFileName})` :
      sourceFileName
  }
  // Mirror the composed root name into Name/LongName so the NavTree
  // root and Properties panel show it instead of the generic
  // "<mime> model" placeholder. Everything above is sanitized.
  if (typeof model.name === 'string' && model.name !== '') {
    model.Name = model.Name || {value: model.name}
    model.LongName = model.LongName || {value: model.name}
  }
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

  // Cache-hit hydration for BLDRS_spatial_tree. When the GLTFLoader
  // plugin decoded the extension it parked the tree on
  // `model.userData.bldrsSpatialTree`. Promote it to a model-level
  // method so consumers (`Containers/CadView.jsx#onModel` etc.) can
  // call `model.getSpatialStructure(modelID, withProperties)` and get
  // the real IFC hierarchy without going through the (monkey-patched,
  // shared-across-models) `viewer.IFC.loader.ifcManager` shim above.
  // Live IFC parses miss this branch — they have no extension in their
  // userData — and fall through to the legacy `ifcManager` path.
  //
  // The closure ignores both arguments because a cache artifact holds
  // exactly one model's tree (one IFC per GLB; modelID is always 0 in
  // the consumer at CadView.jsx; properties are pre-serialised into
  // the tree at writer time so `withProperties` has no run-time effect).
  // Args are kept on the signature so the call shape matches
  // `ifcManager.getSpatialStructure(modelID, withProperties)` — callers
  // don't branch on which backend they're hitting.
  const spatialTree = model.userData?.bldrsSpatialTree
  if (spatialTree) {
    model.getSpatialStructure = (_modelID, _withProperties) => spatialTree
    glbVerbose(
      'reader: hydrated NavTree from BLDRS_spatial_tree (' +
      `root expressID=${spatialTree.expressID}, type=${spatialTree.type})`)
  }

  // Cache-hit hydration for BLDRS_element_properties. The reader
  // plugin parked a lazy per-entity payload on
  // `model.userData.bldrsElementProperties` (block-indexed container
  // bytes + `getRecord`/`getPsetIds` accessors). Promote it to
  // `model.getItemProperties(id)` and `model.getPropertySets(id)` so
  // the Properties panel (`Components/Properties/Properties.jsx`,
  // `Components/Properties/itemProperties.jsx`) renders on cache-hit
  // without touching the (shared, parser-stateless) `ifcManager`.
  //
  // First call to either method decodes the payload's header index;
  // each record block inflates only when one of its entities is
  // requested (LRU-cached). A load that never opens the Properties
  // panel pays nothing, and no call ever materialises the whole
  // closure — which is what keeps >512MiB-JSON models (over V8's max
  // string length) working at all. See `bldrsElementProperties.js`.
  //
  // Signature note: the closures take one arg (expressID), matching
  // `web-ifc-three.IFCModel.getItemProperties(id)` / `getPropertySets(id)`
  // — NOT the underlying ifcManager's (modelID, expressID, ...) form.
  // Consumers call `model.getItemProperties(refId)` directly; the
  // modelID is implicit per cached artifact (one IFC per GLB).
  //
  // Capture wrote shallow item properties (refs as `{type:5, value:id}`).
  // `getPropertySets` returns the array of pset objects looked up
  // from the propertySets index, matching the existing consumer
  // expectation in Properties.jsx#createPsetsList.
  const elementProperties = model.userData?.bldrsElementProperties
  if (elementProperties && typeof elementProperties.getRecord === 'function') {
    model.getItemProperties = (expressID) => elementProperties.getRecord(expressID)
    model.getPropertySets = (expressID) => {
      return elementProperties.getPsetIds(expressID)
        .map((pid) => elementProperties.getRecord(pid))
        .filter((p) => p !== null && p !== undefined)
    }
    glbVerbose(
      'reader: hydrated Properties panel from BLDRS_element_properties ' +
      `(${elementProperties.compressed.byteLength}B compressed; ` +
      'decode on first access)')
  }

  // Cache-hit fallback for anonymous geometry pieces (conway#387). The
  // element-properties table above only holds entities reachable from
  // spatial-tree nodes; the ids a below-product pick or permalink names
  // (faces / solids from `BLDRS_face_ids.geometryExpressIds`) aren't in
  // it. The face_ids extension carries their identity ({type, name}) in a
  // small side table — layer it under whatever `getItemProperties` surface
  // exists so transient-row labels ("Face #6321") and the Properties
  // panel's Type row resolve without a live parser. The synthesized shape
  // mirrors Conway's arbitrary-id fallback ({expressID, type, Name}).
  const geometryItemIdentities = model.userData?.bldrsFaceIds?.geometryItemIdentities
  if (geometryItemIdentities && typeof geometryItemIdentities === 'object') {
    const priorGetItemProperties = model.getItemProperties
    model.getItemProperties = async (expressID) => {
      let found
      try {
        found = typeof priorGetItemProperties === 'function' ?
          await priorGetItemProperties.call(model, expressID) :
          undefined
      } catch {
        found = undefined
      }
      if (found !== undefined && found !== null) {
        return found
      }
      const identity = geometryItemIdentities[expressID]
      if (!identity) {
        return found
      }
      const IFC_LABEL_TYPE = 1
      return {
        expressID,
        type: identity.type,
        Name: {type: IFC_LABEL_TYPE, value: identity.name ?? ''},
      }
    }
    glbInfo(
      'reader: hydrated anonymous-geometry identities from BLDRS_face_ids ' +
      `(${Object.keys(geometryItemIdentities).length} distinct geometry ids)`)
  }
  // Only override the manager's stock `getExpressId` for genuinely
  // unstructured models (OBJ / STL / direct .glb upload — no per-vertex
  // expressID attribute on any mesh). When the model came from our IFC→
  // GLB cache, the renamed `expressID` attribute restored above lets
  // web-ifc-three's stock implementation work correctly. The previous
  // unconditional override polluted the manager globally — every
  // subsequent pick on any model returned `geom.id` until page refresh.
  if (!foundPreservedExpressId) {
    model.ifcManager.getExpressId = (geom, faceNdx) => {
      debug().log('getExpressId, geom, facedNdx', geom, faceNdx)
      return geom.id
    }
  } else {
    glbVerbose('reader: picking source = per-vertex _EXPRESSID (preserved through GLB cache)')
  }
  if (foundPreservedInstanceId) {
    glbVerbose('reader: per-instance source = per-vertex _INSTANCEID (preserved through GLB cache)')
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
    // For IFC/async (Conway) loads, ShareIfcLoader.parse stashes the real
    // engine failure on `viewer.IFC.ifcLastError` before returning a falsy
    // model (it only re-throws OOM-classified errors; everything else is
    // caught and returned as null). Surfacing that captured error here —
    // instead of a blanket 'Loader could not read model' — does two things:
    //   (1) lets `isOutOfMemoryError` route constrained-device memory
    //       failures into the OOM "device too constrained" UX, and
    //   (2) gives Sentry the true Conway error for grouping instead of
    //       collapsing every failure into one opaque bucket (SHARE-RS,
    //       11k+ events, ~100% old Android — the generic message hid the
    //       actual cause from triage).
    // Non-IFC loaders never set `ifcLastError`, so they keep the generic
    // message. Mirrors the (now unreachable-for-IFC) fallback in `load()`.
    const lastErr = (isIfc && viewer && viewer.IFC && viewer.IFC.ifcLastError) ||
      new Error('Loader could not read model')
    throw markIfOutOfMemory(lastErr)
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
      // A `THREE.BatchedMesh`'s `.geometry` is its internal PACKED buffer —
      // every shape in un-instanced local space (which, for models whose
      // shapes carry building-scale local coords like Schependomlaan, spans
      // the whole site, ~830m). Hoisting it onto the Group root makes
      // `Box3.setFromObject` read that instead of recursing into the
      // instance-placed children, so fit-to-frame zooms miles out. The
      // batched Group has no single representative geometry — leave
      // `model.geometry` undefined and let bounds recurse to the children.
      if (obj.geometry && !obj.isBatchedMesh) {
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
      // ShareIfcLoader (`src/viewer/ifc/ShareIfcLoader.js`) is wired
      // up as `viewer.ifcLoader` at viewer construction (see
      // `src/viewer/ShareViewer.js`). It owns the Conway-direct parse
      // entry point that `readModel` invokes below. The fork's
      // wit-three IFCLoader at `viewer.IFC.loader` is left untouched
      // because fork-side consumers (IfcClipper, ClippingEdges, fills,
      // glTF exporter) still reach for `.loader.ifcManager.{subsets,
      // createSubset, parser.optionalCategories, state}`.
      loader = viewer.ifcLoader
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
    case 'ksplat':
    case 'ply':
    case 'sog':
    case 'splat':
    case 'spz': {
      // Gaussian splat formats via Spark (see src/loader/splats.js and
      // issue #1726). The shim's async parse decodes bytes to a
      // SplatMesh; the fixup wraps it into the Share model Group and
      // installs the scene-level SparkRenderer that draws it.
      loader = newSplatLoader(extension)
      isLoaderAsync = true
      isFormatText = false
      fixupCb = splatsToThree
      break
    }
    case 'stl': {
      loader = new STLLoader
      fixupCb = stlToThree
      isFormatText = false
      break
    }
    case 'usd':
    case 'usda':
    case 'usdc':
    case 'usdz': {
      // One arm for the whole family: USDLoader.parse sniffs the actual
      // variant from the bytes (crate magic → USDC, zip magic → USDZ,
      // otherwise USDA text), so the URL extension only needs to route
      // here. Keep isFormatText false even for .usda — parse() takes the
      // ArrayBuffer and does its own decode. The composer applies stage
      // `upAxis` and `metersPerUnit` itself, and returns a Group whose
      // prim names ride on Object3D.name, which convertToShareModel
      // mirrors into Name/LongName for the NavTree.
      loader = new USDLoader()
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
  loader.register((parser) => new BldrsSpatialTreeReader(parser))
  loader.register((parser) => new BldrsElementPropertiesReader(parser))
  loader.register((parser) => new BldrsFaceIdsReader(parser))
  loader.register((parser) => new BldrsInstanceTablesReader(parser))
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
 * Computes progress and calls given onProgress handler
 *
 * Emits a structured 'download' event (same shape as conway's
 * ProgressEvents, see loader/loadProgress.js) when axios knows the total,
 * so the backdrop is determinate during download too; falls back to the
 * legacy MB string otherwise.
 *
 * @param {Event} progressEvent
 * @param {Function} onProgress
 */
function onDownloadProgressHandler(progressEvent, onProgress) {
  if (Number.isFinite(progressEvent.loaded)) {
    const loadedBytes = progressEvent.loaded
    if (Number.isFinite(progressEvent.total) && progressEvent.total > 0) {
      onProgress({
        phase: 'download',
        completed: loadedBytes,
        total: progressEvent.total,
        unit: 'bytes',
      })
      return
    }
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
    // Schema version varies with the active flag state — compression mode
    // AND the batched-native layout flag — so a flag-off reader never picks
    // up a flag-on writer's bytes (and vice versa). One spec helper keeps
    // this lookup and the writer's key derivation in agreement; see
    // glbCompress.js#activeArtifactSpec.
    const {schemaVer, mode: requestedMode} = activeArtifactSpec()
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
  // Element-level picking on cache-hit GLB is now handled by the
  // capability-driven path in `ShareViewer#setSelection` /
  // `#highlightIfcItem`: `inferModelCapabilities` promotes
  // `expressIdPicking` on the loaded model (it has per-vertex
  // `expressID` from the IFC→GLB cache round-trip), and
  // `attachElementSubsets` gives the model a `createSubset` method
  // that synthesises the selection / preselection meshes directly
  // from the per-vertex attribute. No need to fake `viewer.IFC.type`.
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
  // Stash the compression mode on the merged userData so downstream
  // decoration (`convertToShareModel`) can decide whether per-vertex
  // `_EXPRESSID` / `_INSTANCEID` is trustworthy. DRACO quantises
  // integer attributes (16-bit ceiling) and Meshopt welds shared
  // vertices — both silently corrupt per-vertex IDs. The face_ids
  // path bypasses both, but the legacy per-vertex fallback must NOT
  // run on compressed artifacts.
  merged.userData.bldrsCompressionMode = mode || null
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
    // Bubble extension data parked on the chunk's scene by GLTFLoader
    // plugins (`bldrsSpatialTree`, `bldrsPayload`, …) up to the merged
    // wrapper. Otherwise `convertToShareModel` and
    // `inferModelCapabilities` — which inspect `model.userData` on the
    // root we return — would miss it. With multiple chunks the last
    // one wins (per-chunk extensions clobber the merged userData in
    // load order); today the writer only emits one chunk.
    if (gltf.scene?.userData) {
      Object.assign(merged.userData, gltf.scene.userData)
    }
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

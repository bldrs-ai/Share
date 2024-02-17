import debug from '../utils/debug'
import {getUploadedBlobPath} from '../utils/loader'
import {getFinalUrl} from './urls'
import {hasValidUrlParams as urlHasCameraParams} from '../Components/CameraControl'
import {
  getModelFromOPFS,
  downloadToOPFS,
  isOpfsAvailable,
} from '../OPFS/utils'
import * as Analytics from '../privacy/analytics'
import {getLatestCommitHash} from '../utils/GitHub'
import {parseGitHubPath} from '../utils/location'
import {handleBeforeUnload} from '../utils/event'


/**
 * Load IFC helper used by 1) useEffect on path change and 2) upload button
 *
 * @param {string} filepath
 */
export async function loadIfc({
  viewer,
  filepath, appPrefix, pathPrefix,
  setIsModelLoading, setModel, setSnackMessage,
  accessToken,
  customViewSettings,
  navigate, setFile,
  updateLoadedFileInfo,
}) {
  debug().log(`CadView#loadIfc: `, filepath)
  const uploadedFile = pathPrefix.endsWith('new')

  if (uploadedFile) {
    filepath = getUploadedBlobPath(filepath)
    debug().log('CadView#loadIfc: parsed blob: ', filepath)
    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  const loadingMessageBase = `Loading ${filepath}`
  setIsModelLoading(true)
  setSnackMessage(`${loadingMessageBase}`)

  const ifcURL = (uploadedFile || filepath.indexOf('/') === 0) ?
        filepath : await getFinalUrl(filepath, accessToken)

  let loadedModel
  if (!isOpfsAvailable()) {
    // fallback to loadIfcUrl
    loadedModel = await viewer.loadIfcUrl(
      ifcURL,
      !urlHasCameraParams(), // fit to frame
      (progressEvent) => {
        if (Number.isFinite(progressEvent.loaded)) {
          const loadedBytes = progressEvent.loaded
          // eslint-disable-next-line no-magic-numbers
          const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
          setSnackMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
          debug().log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
        }
      },
      (error) => {
        debug().log('CadView#loadIfc$onError: ', error)
      }, customViewSettings)
  } else if (uploadedFile) {
    const file = await getModelFromOPFS('BldrsLocalStorage', 'V1', 'Projects', filepath)

    if (file instanceof File) {
      setFile(file)
    } else {
      debug().error('Retrieved object is not of type File.')
    }

    loadedModel = await viewer.loadIfcFile(
      file,
      !urlHasCameraParams(),
      (error) => {
        debug().log('CadView#loadIfc$onError: ', error)
      }, customViewSettings)
    // TODO(nickcastel50): need a more permanent way to
    // prevent redirect here for bundled ifc files
  } else if (ifcURL === '/index.ifc') {
    const file = await downloadToOPFS(
      navigate,
      appPrefix,
      handleBeforeUnload,
      ifcURL,
      'index.ifc',
      'bldrs-ai',
      'BldrsLocalStorage',
      'V1',
      'Projects',
      (progressEvent) => {
        if (Number.isFinite(progressEvent.receivedLength)) {
          const loadedBytes = progressEvent.receivedLength
          // eslint-disable-next-line no-magic-numbers
          const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
          setSnackMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
          debug().log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
        }
      })

    if (file instanceof File) {
      setFile(file)
    } else {
      debug().error('Retrieved object is not of type File.')
    }

    loadedModel = await viewer.loadIfcFile(
      file,
      !urlHasCameraParams(),
      (error) => {
        debug().log('CadView#loadIfc$onError: ', error)
      }, customViewSettings)
  } else if (ifcURL === '/haus.ifc') {
    loadedModel = await viewer.loadIfcUrl(
      ifcURL,
      !urlHasCameraParams(), // fit to frame
      (progressEvent) => {
        if (Number.isFinite(progressEvent.loaded)) {
          const loadedBytes = progressEvent.loaded
          // eslint-disable-next-line no-magic-numbers
          const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
          setSnackMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
          debug().log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
        }
      },
      (error) => {
        debug().log('CadView#loadIfc$onError: ', error)
      }, customViewSettings)
  } else {
    // TODO(pablo): probably already available in this scope, or use
    // parseGitHubRepositoryURL instead.
    const url = new URL(ifcURL)
    const {isPublic, owner, repo, branch, filePath} = parseGitHubPath(url.pathname)
    const commitHash = isPublic ?
          await getLatestCommitHash(owner, repo, filePath, '', branch) :
          await getLatestCommitHash(owner, repo, filePath, accessToken, branch)

    if (commitHash === null) {
      debug().error(`Error obtaining commit hash for: ${ifcURL}`)
    }

    const file = await downloadToOPFS(
      navigate,
      appPrefix,
      handleBeforeUnload,
      ifcURL,
      filePath,
      commitHash,
      owner,
      repo,
      branch,
      (progressEvent) => {
        if (Number.isFinite(progressEvent.receivedLength)) {
          const loadedBytes = progressEvent.receivedLength
          // eslint-disable-next-line no-magic-numbers
          const loadedMegs = (loadedBytes / (1024 * 1024)).toFixed(2)
          setSnackMessage(`${loadingMessageBase}: ${loadedMegs} MB`)
          debug().log(`CadView#loadIfc$onProgress, ${loadedBytes} bytes`)
        }
      })

    if (file instanceof File) {
      setFile(file)
    } else {
      debug().error('Retrieved object is not of type File.')
    }

    loadedModel = await viewer.loadIfcFile(
      file,
      !urlHasCameraParams(),
      (error) => {
        debug().log('CadView#loadIfc$onError: ', error)
      }, customViewSettings)
  }

  if (loadedModel) {
    // Fix for https://github.com/bldrs-ai/Share/issues/91
    //
    // TODO(pablo): huge hack. Somehow this is getting incremented to
    // 1 even though we have a new IfcViewer instance for each file
    // load.  That modelID is used in the IFCjs code as [modelID] and
    // leads to undefined refs e.g. in prePickIfcItem.  The id should
    // always be 0.
    loadedModel.modelID = 0
    setModel(loadedModel)
    updateLoadedFileInfo(uploadedFile, ifcURL)

    await viewer.isolator.setModel(loadedModel)

    Analytics.recordEvent('select_content', {
      content_type: 'ifc_model',
      item_id: filepath,
    })
    return loadedModel
  }

  debug().error('CadView#loadIfc: Model load failed!')
  return null
}

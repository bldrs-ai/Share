import React, {ReactElement, useEffect, useRef} from 'react'
import {Helmet} from 'react-helmet-async'
import {useNavigate, useParams} from 'react-router-dom'
import CadView from './Containers/CadView'
import useConnectionsInit from './connections/useConnectionsInit'
import useGithubLastModified from './connections/useGithubLastModified'
import {consumePendingModelNameUpdate, updateRecentFileModelTitle} from './connections/persistence'
import WidgetApi from './WidgetApi/WidgetApi'
import useStore from './store/useStore'
import debug from './utils/debug'
import {pageTitleForModel} from './utils/modelDisplayName'
import {navToDefault} from './utils/navigate'
import {FilenameParseError} from './Filetype'
import {UNSUPPORTED_FILE_ALERT, handleRoute} from './routes/routes'


/**
 * Handles path demuxing to pass to CadView.
 *
 * @property {string} installPrefix e.g. '' on bldrs.ai or /Share on GitHub pages.
 * @property {string} appPrefix e.g. /share is the prefix for this component.
 * @property {string} pathPrefix The full path prefix, e.g. /share/v/p for /share/v/p/index.ifc.
 * @return {ReactElement}
 */
export default function Share({installPrefix, appPrefix, pathPrefix}) {
  const navigate = useNavigate()
  const routeParams = useParams()
  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const modelPath = useStore((state) => state.modelPath)
  const searchIndex = useStore((state) => state.searchIndex)
  const setModelPath = useStore((state) => state.setModelPath)
  const model = useStore((state) => state.model)
  const setIsVersionsEnabled = useStore((state) => state.setIsVersionsEnabled)
  const setIsShareEnabled = useStore((state) => state.setIsShareEnabled)
  const setIsNotesEnabled = useStore((state) => state.setIsNotesEnabled)
  const setRepository = useStore((state) => state.setRepository)
  const setAlert = useStore((state) => state.setAlert)
  const widgetApiRef = useRef(null)

  // Hydrate persisted Connections & Sources from localStorage
  useConnectionsInit()
  useGithubLastModified(modelPath, routeParams['branch'])

  useEffect(() => {
    if (isAppsEnabled && !widgetApiRef.current) {
      widgetApiRef.current = new WidgetApi(navigate, searchIndex)
    }
  }, [isAppsEnabled, navigate, searchIndex])


  /**
   * On a change to routeParams, setting a new model path will clear the
   * scene and load the new model IFC.  If there's not a valid IFC,
   * the helper will redirect to the index file.
   *
   * Otherwise, the param change is a sub-path, e.g. the IFC element
   * path, so no other useEffect is triggered.
   */
  useEffect(() => {
    /**
     * A demux to help forward to the index file, load a new model or do nothing.
     *
     * @return {boolean} False when the route was unusable and has already been
     *   handled (alert + fallback), so the rest of the effect must stop rather
     *   than configure a repository out of the params that just failed to parse.
     */
    const onChangeUrlParams = (() => {
      debug().log('pathPrefix: ', pathPrefix)
      let mp
      try {
        mp = handleRoute(pathPrefix, routeParams)
      } catch (e) {
        // Route parsing throws FilenameParseError for any path that doesn't
        // name a file Share can open — an unrecognized extension
        // ('Jetenginestep.st'), or a bare directory path. Thrown from inside
        // this effect it reached the ErrorBoundary and took the whole app
        // down for what is really a bad link (SHARE-1H4). Say so and fall
        // back to the home model, which is what an unusable route already
        // did. The raw message names the internal extension regex, so it is
        // deliberately not what the user is shown.
        if (!(e instanceof FilenameParseError)) {
          throw e
        }
        debug().warn('Share#onChangeUrlParams: unsupported model path: ', e)
        setAlert(UNSUPPORTED_FILE_ALERT)
        navToDefault(navigate, appPrefix)
        return false
      }
      if (mp === null) {
        navToDefault(navigate, appPrefix)
        return true
      }
      if (modelPath === null ||
          (modelPath.filepath && modelPath.filepath !== mp.filepath) ||
          (modelPath.gitpath && modelPath.gitpath !== mp.gitpath) ||
          (!modelPath.gitpath && mp.gitpath)) {
        setModelPath(mp)
        debug().log('Share#onChangeUrlParams: new model path: ', mp)
      }
      return true
    })
    // An unusable route (mp === null) still falls through to the repository
    // block below — that is pre-existing behaviour for an empty path, which
    // still carries usable :org/:repo. A *failed parse* does not: its params
    // are the ones that just threw, so configuring a repository from them
    // would flash setRepository(badOrg, badRepo) on the way to the fallback.
    if (!onChangeUrlParams()) {
      return
    }

    // TODO(pablo): currently expect these to both be defined.
    const {org, repo} = routeParams
    if (org && repo) {
      debug().log(`Requested repo: ${org}/${repo}`)
      setRepository(org, repo)
      setIsVersionsEnabled(true)
      setIsShareEnabled(true)
      setIsNotesEnabled(true)
    } else if (pathPrefix.startsWith('/share/v/p')) {
      debug().log('Setting default repo pablo-mayrgundter/Share')
      setRepository('pablo-mayrgundter', 'Share')
      setIsVersionsEnabled(true)
      setIsShareEnabled(true)
      setIsNotesEnabled(true)
    } else if (
      pathPrefix.startsWith('/share/v/u') || // generic url
        pathPrefix === '/share/v/g' // google
    ) {
      debug().log('Model path is external URL:', modelPath)
      setRepository('external', 'content')
      setIsVersionsEnabled(false)
      setIsShareEnabled(true)
      setIsNotesEnabled(false)
    } else {
      debug().warn('No repository set for project!, ', pathPrefix)
      // Local /v/new models have no repository
      setRepository(null, null)
      setIsVersionsEnabled(false)
      setIsShareEnabled(false)
      setIsNotesEnabled(false)
    }
  }, [appPrefix, installPrefix, modelPath, model, navigate, pathPrefix,
    setAlert, setIsVersionsEnabled, setIsShareEnabled, setIsNotesEnabled,
    setModelPath, setRepository, routeParams])

  useEffect(() => {
    if (!model?.name) {
      return
    }
    if (modelPath?.kind === 'provider' && modelPath?.provider === 'google') {
      updateRecentFileModelTitle(modelPath.fileId, model.name)
    } else {
      const fileId = consumePendingModelNameUpdate()
      if (fileId) {
        updateRecentFileModelTitle(fileId, model.name)
      }
    }
  }, [model?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const modelName = model?.name || (model?.mimeType ? `(${model.mimeType})` : undefined) || undefined
  return (
    modelPath &&
    <>
      <PageTitle modelPath={modelPath} modelName={modelName} isUploadedFile={model?.isUploadedFile}/>
      <CadView
        installPrefix={installPrefix}
        appPrefix={appPrefix}
        pathPrefix={pathPrefix}
      />
    </>
  )
}


/**
 * @param {object} modelPath The model path from routes
 * @param {string|undefined} modelName The model name extracted from loader and set on store.model
 * @param {boolean} isUploadedFile Whether the model is an uploaded file
 * @return {ReactElement}
 */
function PageTitle({modelPath, modelName, isUploadedFile}) {
  return (
    <Helmet>
      <title>{pageTitleForModel(modelPath, modelName, isUploadedFile)}</title>
    </Helmet>
  )
}

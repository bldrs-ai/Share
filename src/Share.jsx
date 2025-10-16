import React, {ReactElement, useEffect, useRef} from 'react'
import {Helmet} from 'react-helmet-async'
import {useNavigate, useParams} from 'react-router-dom'
import CadView from './Containers/CadView'
import WidgetApi from './WidgetApi/WidgetApi'
import useStore from './store/useStore'
import debug from './utils/debug'
import {navToDefault} from './utils/navigate'
import {handleRoute} from './routes/routes'


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
  const widgetApiRef = useRef(null)

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
    /** A demux to help forward to the index file, load a new model or do nothing. */
    const onChangeUrlParams = (() => {
      debug().log('pathPrefix: ', pathPrefix)
      const mp = handleRoute(pathPrefix, routeParams)
      if (mp === null) {
        navToDefault(navigate, appPrefix)
        return
      }
      if (modelPath === null ||
          (modelPath.filepath && modelPath.filepath !== mp.filepath) ||
          (modelPath.gitpath && modelPath.gitpath !== mp.gitpath) ||
          (!modelPath.gitpath && mp.gitpath)) {
        setModelPath(mp)
        debug().log('Share#onChangeUrlParams: new model path: ', mp)
      }
    })
    onChangeUrlParams()

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
      setIsVersionsEnabled, setIsShareEnabled, setIsNotesEnabled,
      setModelPath, setRepository, routeParams])

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
  let titleStr = ''
  const modelPathFilename = modelPath.filepath?.split('/').pop()
  switch (modelPath.kind) {
    case 'file':
      if (isUploadedFile) {
        titleStr = `New: ${modelName}`
      } else {
        titleStr = `${modelName || modelPathFilename}`
      }
      break
    case 'provider':
      switch (modelPath.provider) {
        case 'google':
          titleStr = `Google: ${modelName || 'file'}`
          break
        case 'github':
          if (modelName === undefined) {
            modelName = `${modelPath.repo}/${modelPath.filepath} at ${modelPath.branch}`
          }
          titleStr = `GitHub: ${modelName}`
          break
        default:
          titleStr = `${modelPath.provider}: ${modelName || modelPathFilename}`
      }
      break
    case 'srcUrl':
      titleStr = modelName || modelPathFilename
      break
    default:
      titleStr = `Loading...`
  }

  return (
    <Helmet>
      <title>{titleStr}</title>
    </Helmet>
  )
}

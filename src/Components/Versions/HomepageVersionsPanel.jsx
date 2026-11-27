import React, {ReactElement, useEffect, useState} from 'react'
import {RestartAlt as RestartAltIcon} from '@mui/icons-material'
import {captureException} from '@sentry/react'
import {useNavigate} from 'react-router-dom'
import {navigateToModel} from '../../app/navigate'
import {importModuleFromUrl} from '../../export/importModuleFromUrl'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import Loader from '../Loader'
import NoContent from '../NoContent'
import Panel from '../SideDrawer/Panel'
import VersionsTimeline from './VersionsTimeline'
import {VERSIONS_TITLE} from './component'
import {HOMEPAGE_VERSIONS_DIRECTORY, homepageRevision} from './homepageModel'


let historyRequest

/**
 * Load the public fixture once per page. Leave it retryable if the static
 * assets are briefly unavailable, for example during a deploy.
 *
 * @return {Promise<object>}
 */
function loadHistory() {
  if (!historyRequest) {
    const runtime = new URL('./Components/Versions/homepageGit.js', import.meta.url)
    const repo = new URL(`./${HOMEPAGE_VERSIONS_DIRECTORY}/repository/`, import.meta.url)
    historyRequest = importModuleFromUrl(runtime.href)
      .then(({readHomepageHistory}) => readHomepageHistory(repo))
      .catch((error) => {
        historyRequest = undefined
        captureException(error, {tags: {component: 'HomepageVersionsPanel'}})
        throw error
      })
  }
  return historyRequest
}


/**
 * Versions for the public, same-origin homepage demo.
 *
 * @param {object} props
 * @param {string} props.filePath Parsed file path
 * @return {ReactElement}
 */
export default function HomepageVersionsPanel({filePath}) {
  const appPrefix = useStore((state) => state.appPrefix)
  const setIsVersionsVisible = useStore((state) => state.setIsVersionsVisible)
  const navigate = useNavigate()
  const [history, setHistory] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let mounted = true
    loadHistory().then((result) => {
      if (mounted) {
        setHistory(result)
      }
    }, () => {
      if (mounted) {
        setError(true)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  const activeRevision = homepageRevision(filePath)
  const staticRoute = `${appPrefix}/v/p`
  return (
    <Panel
      title={VERSIONS_TITLE}
      actions={activeRevision &&
        <TooltipIconButton
          title='Back to live model'
          icon={<RestartAltIcon className='icon-share'/>}
          onClick={() => navigateToModel(`${staticRoute}/index.ifc`, navigate)}
          placement='bottom'
          size='small'
        />}
      onClose={() => setIsVersionsVisible(false)}
      data-testid='VersionsPanel'
    >
      <>
        {error && <NoContent message='Homepage versions are unavailable'/>}
        {!history && !error && <Loader/>}
        {history &&
          <VersionsTimeline
            commits={history.commits}
            currentRef={activeRevision || history.main}
            commitNavigateCb={(index) => navigateToModel(
              `${staticRoute}/${HOMEPAGE_VERSIONS_DIRECTORY}/${history.commits[index].sha}/index.ifc`,
              navigate,
            )}
          />}
      </>
    </Panel>
  )
}

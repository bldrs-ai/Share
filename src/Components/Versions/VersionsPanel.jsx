import React, {ReactElement, useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import useStore from '../../store/useStore'
import {getCommitsForFile} from '../../net/github/Commits'
import {assertDefined} from '../../utils/assert'
import debug from '../../utils/debug'
import {navigateBaseOnModelPath} from '../../utils/location'
import {TooltipIconButton} from '../Buttons'
import Panel from '../SideDrawer/Panel'
import VersionsTimeline from './VersionsTimeline'
import RestartAltIcon from '@mui/icons-material/RestartAlt'


/**
 * VersionsPanel displays a series of versions in a timeline format.
 * Each version corresponds to a commit, and this component fetches
 * commit data for the provided filepath and displays it
 *
 * @property {string} filePath The file for which commits are fetched
 * @property {string} current The current branch or sha, to indicate is active in UI
 * @return {ReactElement} A timeline panel of versions
 */
export default function VersionsPanel({filePath, currentRef}) {
  assertDefined(filePath, currentRef)
  const accessToken = useStore((state) => state.accessToken)
  const repository = useStore((state) => state.repository)
  const modelPath = useStore((state) => state.modelPath)
  const setIsVersionsVisible = useStore((state) => state.setIsVersionsVisible)

  const [commitData, setCommitData] = useState([])

  const navigate = useNavigate()

  useEffect(() => {
    const fetchCommits = async () => {
      try {
        const commits = await getCommitsForFile(repository, filePath, accessToken)
        if (commits) {
          const versionsInfo = commits.map((entry) => {
            const extractedData = {
              authorName: entry.commit.author.name,
              commitMessage: entry.commit.message,
              commitDate: entry.commit.author.date,
              sha: entry.sha,
            }
            return extractedData
          })
          setCommitData(versionsInfo)
        }
      } catch (error) {
        debug().log(error)
      }
    }
    fetchCommits()
  }, [repository, filePath, accessToken])


  /**
   * Navigate to the indexed commit
   *
   * @param {number} index active commit index
   */
  function navigateToCommit(index) {
    const sha = commitData[index].sha
    if (modelPath) {
      const commitPath =
            navigateBaseOnModelPath(modelPath.org, modelPath.repo, sha, modelPath.filepath)
      navigate({pathname: commitPath})
    }
  }


  /** Navigate to head of main */
  function navigateToMain() {
    if (modelPath) {
      // TODO(pablo): should not hardcode to 'main'
      const mainPath =
            navigateBaseOnModelPath(modelPath.org, modelPath.repo, 'main', modelPath.filepath)
      navigate({pathname: mainPath})
    }
  }


  return (
    <Panel
      title='Versions'
      actions={
        <TooltipIconButton
          title='Refresh'
          icon={<RestartAltIcon className='icon-share'/>}
          onClick={navigateToMain}
          placement='bottom'
          size='small'
        />
      }
      onClose={() => setIsVersionsVisible(false)}
      data-testid='VersionsPanel'
    >
      <VersionsTimeline
        commitData={commitData}
        currentRef={currentRef}
        commitNavigateCb={navigateToCommit}
      />
    </Panel>
  )
}

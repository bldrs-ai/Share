import React, {useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import useStore from '../../store/useStore'
import {getCommitsForFile} from '../../utils/GitHub'
import {assertDefined} from '../../utils/assert'
import debug from '../../utils/debug'
import {navigateBaseOnModelPath} from '../../utils/location'
import Panel from '../Panel'
import VersionsTimeline from './VersionsTimeline'
import RestartAltIcon from '@mui/icons-material/RestartAlt'


/**
 * VersionsContainer displays a series of versions in a timeline format.
 * Each version corresponds to a commit, and this component fetches
 * commit data for the provided filepath and displays it
 *
 * @property {string} filePath The file for which commits are fetched
 * @property {string} current The current branch or sha, to indicate is active in UI
 * @return {React.ReactElement} A timeline panel of versions
 */
export default function VersionsContainer({filePath, currentRef}) {
  assertDefined(filePath, currentRef)
  const [commitData, setCommitData] = useState([])
  const accessToken = useStore((state) => state.accessToken)
  const repository = useStore((state) => state.repository)
  const modelPath = useStore((state) => state.modelPath)
  const toggleIsVersionsVisible = useStore((state) => state.toggleIsVersionsVisible)
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
   * This callBack navigated to the selected commit
   *
   * @param {string} index active commit index
   */
  const commitNavigate = (index) => {
    const sha = commitData[index].sha
    if (modelPath) {
      const commitPath =
            navigateBaseOnModelPath(modelPath.org, modelPath.repo, sha, modelPath.filepath)
      navigate({
        pathname: commitPath,
      })
    }
  }

  const navigateToMain = () => {
    if (modelPath) {
      const mainPath =
            navigateBaseOnModelPath(modelPath.org, modelPath.repo, 'main', modelPath.filepath)
      navigate({
        pathname: mainPath,
      })
    }
  }

  return (
    <Panel
      title='Versions'
      action={
        <Tooltip title="Navigate to the tip of version history">
          <IconButton aria-label="navigate_to_tip" size="small" onClick={navigateToMain} >
            <RestartAltIcon fontSize="inherit"/>
          </IconButton>
        </Tooltip>
      }
      onClose={toggleIsVersionsVisible}
      data-testid='Version Panel'
    >
      <VersionsTimeline
        commitData={commitData}
        currentRef={currentRef}
        commitNavigateCb={commitNavigate}
      />
    </Panel>
  )
}

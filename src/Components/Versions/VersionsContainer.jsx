import React, {useState, useEffect} from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Timeline from './VersionsTimeline'
import Panel from '../Panel'
import useStore from '../../store/useStore'
import {useNavigate} from 'react-router-dom'
import {getCommitsForBranch} from '../../utils/GitHub'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import {navigateBaseOnModelPath} from '../../utils/location'
import debug from '../../utils/debug'


/**
 * VersionsContainer displays a series of versions in a timeline format.
 * Each version corresponds to a commit, and this component fetches
 * commit data for the provided branch and displays it.
 *
 * @param {string} branch The git branch for which commits are fetched.
 * @return {object} A timeline panel of versions.
 */
export default function VersionsContainer({branch}) {
  const [commitData, setCommitData] = useState([])
  const accessToken = useStore((state) => state.accessToken)
  const repository = useStore((state) => state.repository)
  const modelPath = useStore((state) => state.modelPath)
  const toggleIsVersionHistoryVisible = useStore((state) => state.toggleIsVersionHistoryVisible)
  const navigate = useNavigate()


  useEffect(() => {
    const fetchCommits = async () => {
      try {
        const commits = await getCommitsForBranch(repository, branch, accessToken)
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
  }, [repository, branch, accessToken])

  /**
   * This callBack navigated to the selected commit
   *
   * @param {string} index active commit index
   */
  const commitNavigate = (index) => {
    const sha = commitData[index].sha
    if (modelPath) {
      const commitPath = navigateBaseOnModelPath(modelPath.org, modelPath.repo, sha, modelPath.filepath)
      navigate({
        pathname: commitPath,
      })
    }
  }
  const navigteToMain = () => {
    if (modelPath) {
      const mainPath = navigateBaseOnModelPath(modelPath.org, modelPath.repo, 'main', modelPath.filepath)
      navigate({
        pathname: mainPath,
      })
    }
  }


  return (
    <Panel
      content={<Timeline commitData={commitData} commitNavigateCb={commitNavigate}/>}
      testId='Version Panel'
      title='Versions'
      action={
        <Tooltip title="Navigate to the tip of version history">
          <IconButton aria-label="navigate_to_tip" size="small" onClick={navigteToMain} >
            <RestartAltIcon fontSize="inherit"/>
          </IconButton>
        </Tooltip>
      }
      onClose={toggleIsVersionHistoryVisible}
    />
  )
}

import React, {useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import useStore from '../../store/useStore'
import {getCommitsForFile} from '../../utils/GitHub'
import debug from '../../utils/debug'
import {navigateBaseOnModelPath} from '../../utils/location'
import {TooltipIconButton} from '../Buttons'
import Panel from '../SideDrawer/Panel'
import VersionsTimeline from './VersionsTimeline'
import RestartAltIcon from '@mui/icons-material/RestartAlt'


/**
 * VersionsPanel displays a series of versions in a timeline format.
 * Each version corresponds to a commit, and this component fetches
 * commit data for the RepositorySlice's modelPath.filepath and
 * displays it
 *
 * @return {React.ReactElement}
 */
export default function VersionsPanel() {
  const accessToken = useStore((state) => state.accessToken)
  const repository = useStore((state) => state.repository)
  const modelPath = useStore((state) => state.modelPath)
  const setIsVersionsVisible = useStore((state) => state.setIsVersionsVisible)

  const [commitData, setCommitData] = useState([])

  const navigate = useNavigate()


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


  useEffect(() => {
    const fetchCommits = async () => {
      try {
        const commits = await getCommitsForFile(repository, modelPath.filepath, accessToken)
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
  }, [repository, modelPath, accessToken])


  return (
    <Panel
      title='Versions'
      action={
        <TooltipIconButton
          title='Navigate to the head of version history'
          icon={<RestartAltIcon/>}
          onClick={navigateToMain}
        />
      }
      onCloseClick={() => setIsVersionsVisible(false)}
      data-testid='Version Panel'
    >
      <VersionsTimeline
        commitData={commitData}
        currentRef={modelPath.branch}
        commitNavigateCb={navigateToCommit}
      />
    </Panel>
  )
}

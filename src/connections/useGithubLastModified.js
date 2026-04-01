import {useEffect} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {getCommitsForFile} from '../net/github/Commits'
import useStore from '../store/useStore'
import {navigateBaseOnModelPath} from '../utils/location'
import {updateRecentFileLastModified} from './persistence'


/**
 * Back-fills the lastModifiedUtc of a GitHub recent file entry from the
 * latest commit date.  Runs once whenever the GitHub model path changes.
 *
 * @param {object|null} modelPath
 * @param {string} branch Current branch or ref
 */
export default function useGithubLastModified(modelPath, branch) {
  const {isAuthenticated} = useAuth0()
  const accessToken = useStore((state) => state.accessToken)
  const repository = useStore((state) => state.repository)

  useEffect(() => {
    if (!modelPath?.org || !modelPath?.repo || !modelPath?.filepath || !branch) {
      return
    }
    if (!repository?.orgName || !repository?.name) {
      return
    }
    if (isAuthenticated && accessToken === '') {
      return
    }

    const backfill = async () => {
      try {
        const commits = await getCommitsForFile(repository, modelPath.filepath, accessToken)
        if (commits && commits.length > 0) {
          const sharePath = navigateBaseOnModelPath(modelPath.org, modelPath.repo, branch, `/${modelPath.filepath}`)
          updateRecentFileLastModified(sharePath, new Date(commits[0].commit.author.date).getTime())
        }
      } catch {
        // Non-critical — silently ignore network errors
      }
    }
    backfill()
  }, [accessToken, branch, isAuthenticated, modelPath, repository])
}

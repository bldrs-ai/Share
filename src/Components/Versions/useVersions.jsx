import {useEffect, useState} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {getCommitsForFile} from '../../net/github/Commits'
import {assertDefined} from '../../utils/assert'


/** @return {object} */
export default function useVersions({repository, filePath, accessToken}) {
  assertDefined(accessToken, repository.orgName, repository.name, filePath)

  const {isAuthenticated} = useAuth0()

  const [commits, setCommits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchCommits = async () => {
      if (isAuthenticated && accessToken === '') {
        // TODO(pablo): seen these in dev
        console.warn('Unauthed flow while user is logged-in')
        return
      }
      setLoading(true)
      try {
        const gitCommits = await getCommitsForFile(repository, filePath, accessToken)
        if (gitCommits) {
          const extractedCommits = gitCommits.map((entry) => {
            const extractedCommit = {
              authorName: entry.commit.author.name,
              commitMessage: entry.commit.message,
              commitDate: entry.commit.author.date,
              sha: entry.sha,
            }
            return extractedCommit
          })
          setCommits(extractedCommits)
        }
      } catch (e) {
        setError(e)
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchCommits()
  }, [accessToken, filePath, isAuthenticated, repository])

  return {commits, loading, error}
}

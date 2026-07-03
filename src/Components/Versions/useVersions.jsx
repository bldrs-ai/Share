import {useEffect, useState} from 'react'
import {getCommitsForFile} from '../../net/github/Commits'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'


/** @return {object} */
export default function useVersions({repository, filePath, accessToken}) {
  assertDefined(accessToken, repository.orgName, repository.name, filePath)

  const isAuthResolved = useStore((state) => state.isAuthResolved)

  const [commits, setCommits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchCommits = async () => {
      // Wait for BaseRoutes to settle auth before touching the API. Before
      // resolution, isAuthenticated is still false even for logged-in users,
      // so this hook used to fire an anonymous fetch on page load and a
      // second, authed one when the token landed — a duplicate request that
      // also burned the anonymous rate limit. Post-resolution, an empty
      // accessToken is a legitimate state (logged-out or Google-only users)
      // and the anonymous fetch is correct for public repos.
      if (!isAuthResolved) {
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
  }, [accessToken, filePath, isAuthResolved, repository])

  return {commits, loading, error}
}

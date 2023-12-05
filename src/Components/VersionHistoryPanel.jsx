import React, {useState, useEffect} from 'react'
import Timeline from './Timeline'
import Panel from './Panel'
import useStore from '../store/useStore'
import {getCommitsForBranch} from '../utils/GitHub'


/**
 * VersionsHistoryPanel displays a series of versions in a timeline format.
 * Each version corresponds to a commit, and this component fetches
 * commit data for the provided branch and displays it.
 *
 * @param {string} branch The git branch for which commits are fetched.
 * @return {object} A timeline panel of versions.
 */
export default function VersionsHistoryPanel({branch}) {
  const [commitData, setCommitData] = useState([])
  const accessToken = useStore((state) => state.accessToken)
  const repository = useStore((state) => state.repository)
  const toggleIsVersionHistoryVisible = useStore((state) => state.toggleIsVersionHistoryVisible)

  useEffect(() => {
    const fetchCommits = async () => {
      const commits = await getCommitsForBranch(repository, branch, accessToken)
      const versionsInfo = commits.map((entry) => {
        const extractedData = {
          authorName: entry.commit.author.name,
          commitMessage: entry.commit.message,
          commitDate: entry.commit.author.date,
        }
        return extractedData
      })
      setCommitData(versionsInfo)
    }
    fetchCommits()
  }, [repository, branch, accessToken])

  return (
    <Panel
      testId='Version Panel'
      content={<Timeline commitData={commitData}/>}
      title='Versions'
      onClose={toggleIsVersionHistoryVisible}
    />
  )
}

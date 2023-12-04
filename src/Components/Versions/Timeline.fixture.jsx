import React from 'react'
import VersionsTimeline from './VersionsTimeline'
import FixtureContext from '../../FixtureContext'


const commitData = [
  {authorName: 'Version1',
    commitDate: '09.17.2023',
    commitMessage: 'commit 1',
  },
  {authorName: 'Version1',
    commitDate: '09.17.2023',
    commitMessage: 'commit 2',
  },
  {authorName: 'Version1',
    commitDate: '09.17.2023',
    commitMessage: 'commit 3',
  },
  {authorName: 'Version1',
    commitDate: '09.17.2023',
    commitMessage: 'commit 4',
  },
]


export default (
  <FixtureContext>
    <VersionsTimeline commitData={commitData}/>
  </FixtureContext>
)

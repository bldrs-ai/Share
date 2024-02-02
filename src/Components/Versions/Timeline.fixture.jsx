import React from 'react'
import {ThemeCtx} from '../../theme/Theme.fixture'
import VersionsTimeline from './VersionsTimeline'


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
  <ThemeCtx>
    <VersionsTimeline commitData={commitData}/>
  </ThemeCtx>
)

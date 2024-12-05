import React from 'react'
import {ThemeCtx} from '../../theme/Theme.fixture'
import VersionsTimeline from './VersionsTimeline'


export const MOCK_COMMITS = [
  {
    authorName: 'testAuthor1',
    commitDate: '09.17.2023',
    commitMessage: 'commit 1',
  },
  {
    authorName: 'testAuthor2',
    commitDate: '09.18.2023',
    commitMessage: 'commit 2',
  },
  {
    authorName: 'testAuthor3',
    commitDate: '09.19.2023',
    commitMessage: 'commit 3',
  },
  {
    authorName: 'testAuthor4',
    commitDate: '09.20.2023',
    commitMessage: 'commit 4',
  },
]


export default (
  <ThemeCtx>
    <VersionsTimeline commits={MOCK_COMMITS} commitRef='main'/>
  </ThemeCtx>
)

import React from 'react'
import '@testing-library/jest-dom/extend-expect'
import {render, fireEvent} from '@testing-library/react'
import VersionsTimeline from './VersionsTimeline'
import {ThemeCtx} from '../../theme/Theme.fixture'


describe('CustomTimeline', () => {
  const mockCommitData = [
    {
      authorName: 'User1',
      commitDate: '2023-10-13',
      commitMessage: 'Create initial structure',
    },
    {
      authorName: 'User2',
      commitDate: '2023-10-14',
      commitMessage: 'Add new feature',
    },
  ]

  it('displays the correct number of timeline items', () => {
    const commitNavigateCb = jest.fn()
    const {getByText} = render(
      <ThemeCtx>
        <VersionsTimeline
          commitData={mockCommitData}
          currentRef={'main'}
          commitNavigateCb={commitNavigateCb}
        />
      </ThemeCtx>)
    const firstItem = getByText('User1')
    const secondItem = getByText('User2')
    expect(firstItem).toBeInTheDocument()
    expect(secondItem).toBeInTheDocument()
  })

  it('updates the active timeline item on click', () => {
    const commitNavigateCb = jest.fn()
    const {getByText} = render(
      <ThemeCtx>
        <VersionsTimeline
          commitData={mockCommitData}
          currentRef={'main'}
          commitNavigateCb={commitNavigateCb}
        />
      </ThemeCtx>)
    const firstItem = getByText('User1')
    fireEvent.click(firstItem)
    expect(commitNavigateCb).toHaveBeenCalledTimes(1)
  })
})

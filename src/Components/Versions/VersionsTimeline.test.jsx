import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom/extend-expect'
import VersionsTimeline from './VersionsTimeline'


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

  it.only('displays the correct number of timeline items', () => {
    const commitNavigateCb = jest.fn()
    const {getByText} = render(<VersionsTimeline commitData={mockCommitData} commitNavigateCb={commitNavigateCb}/>)
    const firstItem = getByText('User1')
    const secondItem = getByText('User2')
    expect(firstItem).toBeInTheDocument()
    expect(secondItem).toBeInTheDocument()
  })

  it('updates the active timeline item on click', () => {
    const commitNavigateCb = jest.fn()
    const {getByText} = render(<VersionsTimeline commitData={mockCommitData} commitNavigateCb={commitNavigateCb}/>)
    const firstItem = getByText('User1')
    fireEvent.click(firstItem)
    expect(commitNavigateCb).toHaveBeenCalledTimes(1)
  })
})

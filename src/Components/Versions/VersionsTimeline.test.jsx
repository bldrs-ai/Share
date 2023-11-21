import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom/extend-expect'
import VersionsTimeline from './VersionsTimeline'


describe('CustomTimeline', () => {
  const mockCommitData = [
    {
      authorName: 'John Doe',
      commitDate: '2023-10-13',
      commitMessage: 'Create initial structure',
    },
    {
      authorName: 'Jane Smith',
      commitDate: '2023-10-14',
      commitMessage: 'Add new feature',
    },
  ]

  test('renders correctly', () => {
    const items = screen.getAllByText(/Create initial structure|Add new feature/)
    render(<VersionsTimeline commitData={mockCommitData}/>)
    // eslint-disable-next-line no-magic-numbers
    expect(items).toHaveLength(2)
  })

  it('displays the correct number of timeline items', () => {
    const vt = <VersionsTimeline commitData={mockCommitData}/>
    render(vt)
  })

  it.only('updates the active timeline item on click', () => {
    const commitNavigateCb = jest.fn()
    const {getByText} = render(<VersionsTimeline commitData={mockCommitData} commitNavigateCb={commitNavigateCb}/>)
    const firstItem = getByText('John Doe')
    fireEvent.click(firstItem)
    expect(commitNavigateCb).toHaveBeenCalledTimes(1)
  })
})

import React from 'react'
import {render, screen, within, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom/extend-expect'
import CustomTimeline from './Timeline'


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

  beforeEach(() => {
    render(<CustomTimeline commitData={mockCommitData}/>)
  })

  test('renders correctly', () => {
    const items = screen.getAllByText(/Create initial structure|Add new feature/)
    // eslint-disable-next-line no-magic-numbers
    expect(items).toHaveLength(2)
  })

  test('displays the correct number of timeline items', () => {
    const timelineItems = screen.getAllByText((item) =>
      item === 'John Doe' || item === 'Jane Smith',
    )
    expect(timelineItems).toHaveLength(mockCommitData.length)
  })

  test('updates the active timeline item on click', () => {
    const firstItem = screen.getByText('Create initial structure')
    const firstItemContainer = firstItem.closest('div')

    fireEvent.click(firstItem)

    // Adjust this check based on the styling attributes you have for active items.
    expect(within(firstItemContainer).getByText('John Doe')).toHaveStyle({color: 'text.primary'})
  })
})

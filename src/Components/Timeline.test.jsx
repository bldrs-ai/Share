import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import VersionsTimeline from './Timeline' // adjust the import to your file structure
import '@testing-library/jest-dom/extend-expect'


describe('VersionsTimeline component', () => {
  const mockVersionHistory = [
    {name: 'v1.0', date: '09.17.2023', icon: 'architecture', description: 'Intital model'},
    {name: 'v1.1', date: '09.88.2023', icon: 'engineering', description: 'Fix structural details'},
  ]

  it('renders without crashing', () => {
    render(<VersionsTimeline versionHistory={mockVersionHistory}/>)
  })

  it('displays all timeline items from versionHistory prop', () => {
    render(<VersionsTimeline versionHistory={mockVersionHistory}/>)
    expect(screen.getByText('v1.0')).toBeInTheDocument()
    expect(screen.getByText('v1.1')).toBeInTheDocument()
    expect(screen.getByText('09.17.2023')).toBeInTheDocument()
    expect(screen.getByText('Fix structural details')).toBeInTheDocument()
  })

  it('sets active timeline item when clicked', () => {
    render(<VersionsTimeline versionHistory={mockVersionHistory}/>)
    const firstItem = screen.getByText('v1.0')
    const secondItem = screen.getByText('v1.1')
    fireEvent.click(firstItem)
    expect(firstItem).toHaveStyle('color: text.primary')
    fireEvent.click(secondItem)
    expect(secondItem).toHaveStyle('color: text.primary')
  })

  it('displays the correct icons for each item', () => {
    render(<VersionsTimeline versionHistory={mockVersionHistory}/>)
    expect(screen.getByTestId('architecture-icon')).toBeInTheDocument()
    expect(screen.getByTestId('engineering-icon')).toBeInTheDocument()
  })
})

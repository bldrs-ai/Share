import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react'
import {ThemeCtx} from '../../Share.fixture'
import RecentFilesList from './RecentFilesList'


const MS_PER_MINUTE = 60000
const MS_PER_DAY = 86400000

const mockFiles = [
  {
    id: 'file-1',
    source: 'local',
    name: 'MyBuilding.ifc',
    modelTitle: 'Main Office Tower',
    lastModifiedUtc: Date.now() - MS_PER_MINUTE,
  },
  {
    id: 'file-2',
    source: 'local',
    name: 'Bridge.ifc',
    lastModifiedUtc: null,
  },
  {
    id: 'file-3',
    source: 'google-drive',
    name: 'Warehouse.ifc',
    modelTitle: '',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    lastModifiedUtc: Date.now() - (2 * MS_PER_DAY),
  },
]


describe('RecentFilesList', () => {
  it('renders nothing when files is empty', () => {
    const {container} = render(<RecentFilesList files={[]} onOpen={jest.fn()}/>, {wrapper: ThemeCtx})
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when files is undefined', () => {
    const {container} = render(<RecentFilesList onOpen={jest.fn()}/>, {wrapper: ThemeCtx})
    expect(container.firstChild).toBeNull()
  })

  it('shows modelTitle when available, falling back to name', () => {
    render(<RecentFilesList files={mockFiles} onOpen={jest.fn()}/>, {wrapper: ThemeCtx})

    // file-1 has modelTitle — should display it, not the filename
    expect(screen.getByText('Main Office Tower')).toBeInTheDocument()
    expect(screen.queryByText('MyBuilding.ifc')).not.toBeInTheDocument()

    // file-2 has no modelTitle — should fall back to name
    expect(screen.getByText('Bridge.ifc')).toBeInTheDocument()

    // file-3 has empty modelTitle — should fall back to name
    expect(screen.getByText('Warehouse.ifc')).toBeInTheDocument()
  })

  it('uses filename as tooltip title for accessibility', () => {
    render(<RecentFilesList files={mockFiles} onOpen={jest.fn()}/>, {wrapper: ThemeCtx})

    const titleEl = screen.getByText('Main Office Tower')
    expect(titleEl).toHaveAttribute('title', 'MyBuilding.ifc')
  })

  it('calls onOpen with the full entry when a row is clicked', () => {
    const onOpen = jest.fn()
    render(<RecentFilesList files={mockFiles} onOpen={onOpen}/>, {wrapper: ThemeCtx})

    fireEvent.click(screen.getByText('Main Office Tower'))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(mockFiles[0])
  })

  it('renders a row for each file', () => {
    render(<RecentFilesList files={mockFiles} onOpen={jest.fn()}/>, {wrapper: ThemeCtx})

    expect(screen.getByTestId('link-open-recent-file-1')).toBeInTheDocument()
    expect(screen.getByTestId('link-open-recent-file-2')).toBeInTheDocument()
    expect(screen.getByTestId('link-open-recent-file-3')).toBeInTheDocument()
  })

  it('shows relative time for recent files', () => {
    render(<RecentFilesList files={mockFiles} onOpen={jest.fn()}/>, {wrapper: ThemeCtx})

    // file-1 was modified 1 min ago
    expect(screen.getByText('1m ago')).toBeInTheDocument()
    // file-3 was modified 2 days ago
    expect(screen.getByText('2d ago')).toBeInTheDocument()
  })

  // Drag-and-drop stored ISO strings until #1682; those entries are
  // still in users' localStorage and must not render "NaNm ago".
  it('renders a legacy ISO-string timestamp as relative time', () => {
    const legacy = [{id: 'file-4', source: 'local', name: 'Old.ifc',
      lastModifiedUtc: new Date(Date.now() - MS_PER_MINUTE).toISOString()}]
    render(<RecentFilesList files={legacy} onOpen={jest.fn()}/>, {wrapper: ThemeCtx})

    expect(screen.getByText('1m ago')).toBeInTheDocument()
  })

  it('renders no timestamp for an unparseable value', () => {
    const bad = [{id: 'file-5', source: 'local', name: 'Bad.ifc', lastModifiedUtc: 'not-a-date'}]
    render(<RecentFilesList files={bad} onOpen={jest.fn()}/>, {wrapper: ThemeCtx})

    expect(screen.getByText('Bad.ifc')).toBeInTheDocument()
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument()
  })

  it('shows column headers', () => {
    render(<RecentFilesList files={mockFiles} onOpen={jest.fn()}/>, {wrapper: ThemeCtx})

    expect(screen.getByText('Recent models')).toBeInTheDocument()
    expect(screen.getByText('Last modified')).toBeInTheDocument()
  })
})

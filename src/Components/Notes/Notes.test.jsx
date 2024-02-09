import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import Notes from './Notes'


describe('Notes Control', () => {
  beforeEach(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setNotes(null)
    })
  })

  it('Setting notes in zustand', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByText} = render(<ShareMock><Notes/></ShareMock>)
    await act(() => {
      result.current.setSelectedNoteId(null)
    })
    await act(() => {
      result.current.setNotes(MOCK_NOTES)
    })
    expect(await getByText('open_workspace')).toBeInTheDocument()
    expect(await getByText('closed_system')).toBeInTheDocument()
  })

  it('No content message is present when notes are null', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByText} = render(<Notes/>)
    await act(() => {
      result.current.setSelectedNoteId(null)
    })
    await act(() => {
      result.current.setNotes([])
    })
    expect(await getByText('no content')).toBeInTheDocument()
  })

  it('Progress bar is visible when notes are loading', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByRole} = render(<Notes/>)
    await act(() => {
      result.current.toggleIsLoadingNotes()
    })
    expect(await getByRole('progressbar')).toBeInTheDocument()
    await act(() => {
      result.current.toggleIsLoadingNotes()
    })
  })


  it('Note rendered based on selected issue ID', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const extractedNoteId = '10'
    const {findByText} = render(<ShareMock><Notes/></ShareMock>)
    await act(() => {
      result.current.setNotes(MOCK_NOTES)
    })
    await act(() => {
      result.current.setSelectedNoteId(Number(extractedNoteId))
    })
    expect(await findByText('open_workspace')).toBeVisible()
  })
})


const MOCK_NOTES = [
  {
    embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
    index: 0,
    id: 10,
    number: 1,
    title: 'open_workspace',
    body: 'BLDRS aims to enable asynchronous workflows by integrating essential communication channels and open standard.',
    date: '2022-06-01T22:10:49Z',
    username: 'TEST_ISSUE_USERNAME',
    avatarUrl: 'https://avatars.githubusercontent.com/u/3433606?v=4',
    numberOfComments: 2,
    imageUrl: 'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png',
  },
  {
    embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
    index: 0,
    id: 11,
    number: 2,
    title: 'closed_system',
    body: 'It is common for knowledge workers in the AEC industry to operate within information bubbles.2',
    date: '2022-06-01T22:10:49Z',
    username: 'TEST_ISSUE_USERNAME',
    avatarUrl: 'https://avatars.githubusercontent.com/u/3433606?v=4',
    numberOfComments: 2,
    imageUrl: 'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png',
  },
]


import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import Notes from './Notes'
import {MOCK_NOTES} from './Notes.fixture'


describe('Notes', () => {
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

  it('Fetch and display Comments when note is selected', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const extractedNoteId = '10'
    const {findByText} = render(<ShareMock><Notes/></ShareMock>)
    await act(() => {
      result.current.setNotes(MOCK_NOTES)
    })
    await act(() => {
      result.current.setSelectedNoteId(Number(extractedNoteId))
    })
    expect(await findByText('testComment_1')).toBeVisible()
    expect(await findByText('testComment_2')).toBeVisible()
  })
})

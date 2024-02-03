import React from 'react'
import {act, render, renderHook, fireEvent} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import NotesNavBar from './NotesNavBar'


describe('IssueControl', () => {
  beforeEach(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setNotes(null)
    })
  })


  it('NavBar changes to back nav when issue selected', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByTitle} = render(<ShareMock><NotesNavBar/></ShareMock>)
    const testNoteId = 10
    await act(() => {
      result.current.setSelectedNoteId(testNoteId)
    })
    expect(await getByTitle('Back to the list')).toBeInTheDocument()
  })


  it('Navigate notes', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByTitle} = render(<ShareMock><NotesNavBar/></ShareMock>)
    const notes = [
      {id: 1, index: 0},
      {id: 2, index: 1},
      {id: 3, index: 2},
    ]
    await act(() => {
      result.current.setNotes(notes)
      // eslint-disable-next-line no-magic-numbers
      result.current.setSelectedNoteId(2)
    })
    expect(getByTitle('Back to the list')).toBeInTheDocument()
    const nextButton = getByTitle('Next Note')
    expect(nextButton).toBeInTheDocument()
    fireEvent.click(nextButton)
    expect(getByTitle('Next Note')).toBeInTheDocument()
  })

  it('Navigate to create note', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByTitle} = render(<ShareMock><NotesNavBar/></ShareMock>)
    await act(() => {
      result.current.setSelectedNoteId(null)
    })
    const addNote = getByTitle('Add a note')
    expect(addNote).toBeInTheDocument()
    fireEvent.click(addNote)
    expect(getByTitle('Back to the list')).toBeInTheDocument()
  })
})

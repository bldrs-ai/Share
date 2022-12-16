import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
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

  it('Notes NavBar Notes', () => {
    const {getByText} = render(
        <ShareMock>
          <NotesNavBar />
        </ShareMock>,
    )
    expect(getByText('Notes')).toBeInTheDocument()
  })

  it('NavBar changes to back nav when issue selected', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByTitle} = render(
        <ShareMock>
          <NotesNavBar />
        </ShareMock>,
    )
    const testNoteId = 10
    await act(() => {
      result.current.setSelectedNoteId(testNoteId)
    })
    expect(await getByTitle('Back to the list')).toBeInTheDocument()
  })
})

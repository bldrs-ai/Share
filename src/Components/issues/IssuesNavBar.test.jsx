import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import IssuesNavBar from './IssuesNavBar'


describe('IssueControl', () => {
  beforeEach(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setNotes(null)
    })
  })


  it('Issues NavBar Issues', () => {
    const {getByText} = render(<ShareMock><IssuesNavBar/></ShareMock>)
    expect(getByText('Notes')).toBeInTheDocument()
  })


  it('NavBar changes to back nav when issue selected', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const testIssueId = 10
    const {getByTitle} = render(<ShareMock><IssuesNavBar/></ShareMock>)
    await act(() => {
      result.current.setSelectedNoteId(testIssueId)
    })
    expect(await getByTitle('Back to the list')).toBeInTheDocument()
  })
})

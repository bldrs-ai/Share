import React from 'react'
import {act, render, renderHook, screen} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import {IssuesNavBar} from './IssuesControl'


describe('IssuesControl', () => {
  it('displays NavBar', () => {
    render(<ShareMock><IssuesNavBar/></ShareMock>)
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })


  it('NavBar changes to back nav when issue selected', () => {
    const {result} = renderHook(() => useStore((state) => state))
    const testIssueId = 10
    act(() => {
      result.current.setSelectedIssueId(testIssueId)
    })
    render(<ShareMock><IssuesNavBar/></ShareMock>)
    expect(screen.getByTitle('Back to the list')).toBeInTheDocument()
  })
})

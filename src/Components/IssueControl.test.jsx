import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockRoutes} from '../BaseRoutesMock.test'
import {IssuesNavBar} from './IssuesControl'
import {act, renderHook} from '@testing-library/react-hooks'
import useStore from '../store/useStore'


test('Issues NavBar', () => {
  render(<MockRoutes contentElt={<IssuesNavBar/>}/>)
  expect(screen.getByText('Notes')).toBeInTheDocument()
})

test('Issues Control select issue', () => {
  const {result} = renderHook(() => useStore((state) => state))
  act(() => {
    result.current.setSelectedIssueId(10)
  })
  act(() => {
    result.current.setSelectedCommentIndex(10)
  })
  render(<MockRoutes contentElt={<IssuesNavBar/>}/>)
  expect(screen.getByText('Note')).toBeInTheDocument()
})

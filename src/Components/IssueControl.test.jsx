import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockRoutes} from '../BaseRoutesMock.test'
import {IssuesNavBar, Issues} from './IssuesControl'
import {act, renderHook} from '@testing-library/react-hooks'
import useStore from '../store/useStore'


test('Issues Control', () => {
  render(<MockRoutes contentElt={<IssuesNavBar/>}/>)
  expect(screen.getByText('Notes')).toBeInTheDocument()
})

test('Issues Control select issue', () => {
  const {result} = renderHook(() => useStore((state) => state))
  act(() => {
    result.current.setSelectedIssueId(10)
  })
  render(<MockRoutes contentElt={<IssuesNavBar/>}/>)
  expect(screen.getByText('Note')).toBeInTheDocument()
})

test('Issues loading', () => {
  render(<MockRoutes contentElt={<Issues/>}/>)
  expect(screen.getByText('loading')).toBeInTheDocument()
})



import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockRoutes} from '../BaseRoutesMock.test'
import {IssuesNavBar,
  // Issues
} from './IssuesControl'
import {act, renderHook} from '@testing-library/react-hooks'
import useStore from '../store/useStore'
// import {MOCK_ISSUES, MOCK_COMMENTS} from '../utils/GitHub'


test('Issues NavBar Issues', () => {
  render(<MockRoutes contentElt={<IssuesNavBar/>}/>)
  expect(screen.getByText('Notes')).toBeInTheDocument()
})

test('Issues NavBar Comments', () => {
  const {result} = renderHook(() => useStore((state) => state))
  act(() => {
    result.current.setSelectedIssueId(10)
  })
  render(<MockRoutes contentElt={<IssuesNavBar/>}/>)
  expect(screen.getByText('Note')).toBeInTheDocument()
})

// test('Issues ', () => {
//   const {result} = renderHook(() => useStore((state) => state))
//   act(() => {
//     result.current.setSelectedIssueId(null)
//   })
//   act(() => {
//     result.current.setIssues(MOCK_ISSUES)
//   })
//   render(<MockRoutes contentElt={<Issues/>}/>)
//   expect(screen.getByText('TEST_ISSUE_TITLE_1')).toBeInTheDocument()
//   expect(screen.getByText('TEST_ISSUE_TITLE_2')).toBeInTheDocument()
// })

// test('Issues ', () => {
//   const {result} = renderHook(() => useStore((state) => state))
//   act(() => {
//     result.current.setSelectedIssueId(10)
//   })
//   act(() => {
//     result.current.setIssues(MOCK_ISSUES)
//   })
//   act(() => {
//     result.current.setComments(MOCK_COMMENTS)
//   })
//   render(<MockRoutes contentElt={<Issues/>}/>)
//   expect(screen.getByText('TEST_ISSUE_TITLE_1')).toBeInTheDocument()
//   expect(screen.getByText('TEST_COMMENT_BODY_1')).toBeInTheDocument()
//   expect(screen.getByText('TEST_COMMENT_BODY_2')).toBeInTheDocument()
// })



import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockRoutes} from '../BaseRoutesMock.test'
import {IssuesNavBar, Issues} from './IssuesControl'
import {act, renderHook} from '@testing-library/react-hooks'
import useStore from '../store/useStore'


test('Issues NavBar Issues', () => {
  render(<MockRoutes contentElt={<IssuesNavBar/>}/>)
  expect(screen.getByText('Notes')).toBeInTheDocument()
})

test('Issues NavBar Comments', () => {
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

test('Issues ', () => {
  const {result} = renderHook(() => useStore((state) => state))
  const issueArr = [
    {
      embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
      index: 0,
      id: 10,
      number: 1,
      title: 'TEST_ISSUE_TITLE_1',
      body: 'TEST_ISSUE_BODY_1',
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
      title: 'TEST_ISSUE_TITLE_2',
      body: 'TEST_ISSUE_BODY_2',
      date: '2022-06-01T22:10:49Z',
      username: 'TEST_ISSUE_USERNAME',
      avatarUrl: 'https://avatars.githubusercontent.com/u/3433606?v=4',
      numberOfComments: 2,
      imageUrl: 'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png',
    },
  ]
  act(() => {
    result.current.setSelectedIssueId(null)
  })
  act(() => {
    result.current.setSelectedCommentIndex(null)
  })
  act(() => {
    result.current.setIssues(issueArr)
  })
  render(<MockRoutes contentElt={<Issues/>}/>)
  expect(screen.getByText('TEST_ISSUE_TITLE_1')).toBeInTheDocument()
  expect(screen.getByText('TEST_ISSUE_TITLE_2')).toBeInTheDocument()
})

test('Issues ', () => {
  const {result} = renderHook(() => useStore((state) => state))
  const issueArr = [
    {
      embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
      index: 0,
      id: 10,
      number: 1,
      title: 'TEST_ISSUE_TITLE_1',
      body: 'TEST_ISSUE_BODY_1',
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
      title: 'TEST_ISSUE_TITLE_2',
      body: 'TEST_ISSUE_BODY_2',
      date: '2022-06-01T22:10:49Z',
      username: 'TEST_ISSUE_USERNAME',
      avatarUrl: 'https://avatars.githubusercontent.com/u/3433606?v=4',
      numberOfComments: 2,
      imageUrl: 'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png',
    },
  ]
  const CommentsArr = [
    {
      embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
      index: 0,
      id: 10,
      number: 1,
      body: 'TEST_COMMENT_BODY_1',
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
      body: 'TEST_COMMENT_BODY_2',
      date: '2022-06-01T22:10:49Z',
      username: 'TEST_ISSUE_USERNAME',
      avatarUrl: 'https://avatars.githubusercontent.com/u/3433606?v=4',
      numberOfComments: 2,
      imageUrl: 'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png',
    },
  ]
  act(() => {
    result.current.setSelectedIssueId(10)
  })
  act(() => {
    result.current.setSelectedCommentIndex(null)
  })
  act(() => {
    result.current.setIssues(issueArr)
  })
  act(() => {
    result.current.setComments(CommentsArr)
  })
  render(<MockRoutes contentElt={<Issues/>}/>)
  expect(screen.getByText('TEST_ISSUE_TITLE_1')).toBeInTheDocument()
  expect(screen.getByText('TEST_COMMENT_BODY_1')).toBeInTheDocument()
  expect(screen.getByText('TEST_COMMENT_BODY_2')).toBeInTheDocument()
})



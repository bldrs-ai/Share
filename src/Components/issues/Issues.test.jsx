import React from 'react'
import {act, render, renderHook, screen} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import Issues from './Issues'


describe('IssuesControl', () => {
  it('displays all Issues summaries when no issue selected', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedIssueId(null)
      result.current.setIssues(MOCK_ISSUES)
    })
    render(<ShareMock><Issues/></ShareMock>)
    expect(await screen.findByText('open_workspace')).toBeInTheDocument()
    expect(await screen.findByText('closed_system')).toBeInTheDocument()
  })

  it('displays a single issue when issue selected in store', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const testIssueId = 10
    await act(() => {
      result.current.setSelectedIssueId(testIssueId)
      result.current.setIssues(MOCK_ISSUES)
      result.current.setComments(MOCK_COMMENTS)
    })
    render(<ShareMock><Issues/></ShareMock>)
    expect(await screen.findByText('open_workspace')).toBeInTheDocument()
    // expect(await screen.findByText('The Architecture, Engineering and Construction')).toBeInTheDocument()
    // expect(await screen.findByText('Email is the medium that still facilitates major portion of communication')).toBeInTheDocument()
  })
})


const MOCK_ISSUES = [
  {
    embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
    index: 0,
    id: 10,
    number: 1,
    title: 'open_workspace',
    body: 'BLDRS aims to enable asynchronous workflows by integrating essential communication channels and open standards.',
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

const MOCK_COMMENTS = [
  {
    embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
    index: 0,
    id: 10,
    number: 1,
    body: 'The Architecture, Engineering and Construction',
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
    body: 'Email is the medium that still facilitates major portion of communication',
    date: '2022-06-01T22:10:49Z',
    username: 'TEST_ISSUE_USERNAME',
    avatarUrl: 'https://avatars.githubusercontent.com/u/3433606?v=4',
    numberOfComments: 2,
    imageUrl: 'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png',
  },
]

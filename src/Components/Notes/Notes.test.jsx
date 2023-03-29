import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import {server} from '../../__mocks__/server'
import {MOCK_ISSUES_EMPTY} from '../../utils/GitHub'
import Notes from './Notes'
import {rest} from 'msw'


describe('IssueControl', () => {
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

  it('Setting comments in zustand ', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const testIssueId = 10
    const {getByText} = render(<ShareMock><Notes/></ShareMock>)
    await act(() => {
      result.current.setSelectedNoteId(testIssueId)
    })
    await act(() => {
      result.current.setNotes(MOCK_NOTES)
      result.current.setComments(MOCK_COMMENTS)
    })
    expect(await getByText('open_workspace')).toBeVisible()
  })

  it('Issue rendered based on selected issue ID', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const extractedNoteId = '1257156364'
    const {findByText} = render(<ShareMock><Notes/></ShareMock>)

    await act(() => {
      result.current.setSelectedNoteId(Number(extractedNoteId))
    })

    const expectedText = 'Local issue - some text is here to test - Id:1257156364'
    expect(await findByText(expectedText)).toBeVisible()
  })

  it('Issue rendered based on issue ID in URL', async () => {
    const {findByText} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#i:2::c:-26.91,28.84,112.47,-22,16.21,-3.48']}>
          <Notes/>
        </ShareMock>)
    const expectedText = 'Local issue - some text is here to test - Id:1257156364'
    expect(await findByText(expectedText)).toBeVisible()
  })


  // XXX: Should this be split into two different tests?
  describe('when notes are null', () => {
    beforeEach(() => {
      // Set up handler to return an empty set of notes
      server.use(
          rest.get('https://api.github.com/repos/:org/:repo/issues', (req, res, ctx) => {
            return res(
                ctx.json(MOCK_ISSUES_EMPTY),
            )
          }),
      )
    })

    afterEach(() => {
      // Restore the original set of HTTP handlers that return notes
      server.restoreHandlers()
    })

    it('progress bar is present during loading of notes', () => {
      const {getByRole} = render(<ShareMock><Notes/></ShareMock>)
      expect(getByRole('progressbar')).toBeInTheDocument()
    })

    it('progress bar is no longer visible when notes are not-null', async () => {
      const {queryByRole} = render(<ShareMock><Notes/></ShareMock>)

      const {result} = renderHook(() => useStore((state) => state))
      await act(() => {
        result.current.setNotes(MOCK_NOTES)
      })

      // queryByRole is used to not throw an error is the element is missing.
      expect(queryByRole('progressbar')).not.toBeInTheDocument()
    })
  })
})


const MOCK_NOTES = [
  {
    embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
    index: 0,
    id: 10,
    number: 1,
    title: 'open_workspace',
    body: 'BLDRS aims to enable asynchronous workflows by integrating essential communication channels and open standard.',
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
    username: 'TEST_COMMENT_USERNAME',
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
    username: 'TEST_COMMENT_USERNAME',
    avatarUrl: 'https://avatars.githubusercontent.com/u/3433606?v=4',
    numberOfComments: 2,
    imageUrl: 'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png',
  },
]

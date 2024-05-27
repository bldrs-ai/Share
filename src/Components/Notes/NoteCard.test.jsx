import React from 'react'
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn} from '../../__mocks__/authentication'
import useStore from '../../store/useStore'
import ShareMock from '../../ShareMock'
import NoteCard from './NoteCard'
import {MOCK_NOTES} from './Notes.fixture'


describe('NoteCard', () => {
  beforeAll(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setRepository('testOrg', 'testRepo')
    })
    /*
    await act(() => {
      console.error('REPO!', result.current.repository)
    })*/
  })

  it('NoteCard', () => {
    const id = 123
    const index = 123
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    render(
        <ShareMock>
          <NoteCard
            id={id}
            date='2000-01-01T00:00:00Z'
            username='bob'
            index={index}
            title="new_title"
          />
        </ShareMock>)
    expect(screen.getByText('new_title')).toBeInTheDocument()
    expect(screen.getByText(/2000-01-01/)).toBeInTheDocument()
    expect(screen.getByText(/00:00:00Z/)).toBeInTheDocument()
    expect(screen.getByText(/bob/)).toBeInTheDocument()
  })

  it.skip('Number of comments', () => {
    const id = 123
    const index = 123
    const commentCount = 10
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    render(<ShareMock><NoteCard id={id} index={index} numberOfComments={commentCount}/></ShareMock>)
    expect(screen.getByText(commentCount)).toBeInTheDocument()
  })

  it('Select the note card', () => {
    const id = 123
    const index = 123
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const rendered = render(
        <ShareMock>
          <NoteCard id={id} index={index} title="Select the note card - title"/>
        </ShareMock>)
    const selectIssueButton = rendered.getByTestId('note-body')
    fireEvent.click(selectIssueButton)
    expect(screen.getByText('Select the note card - title')).toBeInTheDocument()
  })

  it('Camera Position control', () => {
    const id = 123
    const index = 123
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const rendered = render(
        <ShareMock>
          <NoteCard
            id={id}
            index={index}
            body="Test body [test link](http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34)"
          />
        </ShareMock>)
    const showCamera = rendered.getByTitle('Show the camera view')
    expect(showCamera).toBeInTheDocument()
  })

  it('Note menu has edit and delete', async () => {
    const id = 123
    const index = 123
    const username = 'testing'
    const title = 'Title'
    const noteNumber = 1
    const date = ''
    const synchedNote = true
    const {result} = renderHook(() => useStore((state) => state))

    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

    await act(() => {
      result.current.setNotes(MOCK_NOTES)
    })
    const {getByTestId} = render(
        <ShareMock>
          <NoteCard
            id={id}
            index={index}
            username={username}
            synched={true}
            noteNumber={noteNumber}
            title={title}
            date={date}
            synchedNote={synchedNote}
          />
        </ShareMock>)

    const noteMenuButton = getByTestId('note-menu-button')
    expect(noteMenuButton).toBeInTheDocument()
    expect(fireEvent.click(noteMenuButton)).toBe(true)
    const noteMenu = getByTestId('note-menu')
    expect(noteMenu).toBeInTheDocument()

    const deleteItem = within(noteMenu).getByText('Delete')
    expect(deleteItem).toBeVisible()
    expect(fireEvent.click(deleteItem)).toBe(true)

    expect(fireEvent.click(noteMenuButton)).toBe(true)
    const editItem = within(noteMenu).getByText('Edit')
    expect(editItem).toBeVisible()
    expect(fireEvent.click(editItem)).toBe(true)
  })
})

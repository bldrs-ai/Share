import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn} from '../../__mocks__/authentication'
import ShareMock from '../../ShareMock'
import NoteCard from './NoteCard'


describe('NoteCard', () => {
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

  it('Number of comments', () => {
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
    const selectIssueButton = rendered.getByTestId('selectionContainer')
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

  // it('Delete button is present', () => {
  //   const id = 123
  //   const index = 123
  //   const username = 'Unit Testing'
  //   mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

  //   const {getByTitle, debug} = render(
  //       <ShareMock>
  //         <NoteCard
  //           id={id}
  //           index={index}
  //           username={username}
  //           synched={true}
  //         />
  //       </ShareMock>)
  //    debug()
  //   // expect(getByTitle('Delete')).toBeInTheDocument()
  // })
})

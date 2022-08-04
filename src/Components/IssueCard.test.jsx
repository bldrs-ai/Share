import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import ShareMock from '../ShareMock'
import IssueCard from './IssueCard'


test('IssueCard', () => {
  const id = 123
  const index = 123
  render(
      <ShareMock>
        <IssueCard
          id={id}
          date='2000-01-01T00:00:00Z'
          username='bob'
          index={index}
          title="new_title"
        />
      </ShareMock>)
  expect(screen.getByText('new_title')).toBeInTheDocument()
  expect(screen.getByText('2000-01-01 00:00:00Z')).toBeInTheDocument()
})


test('Number of comments', () => {
  const id = 123
  const index = 123
  const commentCount = 10
  render(<ShareMock><IssueCard id={id} index={index} numberOfComments={commentCount}/></ShareMock>)
  expect(screen.getByText(commentCount)).toBeInTheDocument()
})

test('Select the issue card', () => {
  const id = 123
  const index = 123
  const rendered = render(
      <ShareMock>
        <IssueCard id={id} index={index} title="Select the issue card - title"/>
      </ShareMock>)
  const selectIssueButton = rendered.getByTestId('selectionContainer')
  fireEvent.click(selectIssueButton)
  expect(screen.getByText('Select the issue card - title')).toBeInTheDocument()
})


test('Camera Position control', () => {
  const id = 123
  const index = 123
  const rendered = render(
      <ShareMock>
        <IssueCard
          id={id}
          index={index}
          body="Test body [test link](http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34)"
        />
      </ShareMock>)
  const showCamera = rendered.getByTitle('Show the camera view')
  expect(showCamera).toBeInTheDocument()
})

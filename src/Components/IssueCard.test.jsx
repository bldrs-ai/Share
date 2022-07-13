import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import ShareMock from '../ShareMock'
import IssueCard from './IssueCard'


test('IssueCard', () => {
  const id = 123
  const index = 123
  render(<ShareMock><IssueCard id={id} index={index} title="new_title"/></ShareMock>)
  expect(screen.getByText('new_title')).toBeInTheDocument()
})


test('Number of replies', () => {
  const id = 123
  const index = 123
  render(<ShareMock><IssueCard id={id} index={index} numberOfComments={10}/></ShareMock>)
  expect(screen.getByText(10)).toBeInTheDocument()
})


test('Select the issue card', () => {
  const id = 123
  const index = 123
  const rendered = render(<ShareMock><IssueCard id={id} index={index} title="new_title"/></ShareMock>)
  const selectIssueButton = rendered.getByTestId('test-button')
  fireEvent.click(selectIssueButton)
  expect(selectIssueButton).not.toBeInTheDocument()
})


test('Camera Position control', () => {
  const id = 123
  const index = 123
  const rendered = render(
      <ShareMock>
        <IssueCard
          id={id}
          index={index}
          embeddedUrl="http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34"
        />
      </ShareMock>)
  const showCamera = rendered.getByTitle('Show the camera view')
  expect(showCamera).toBeInTheDocument()
})

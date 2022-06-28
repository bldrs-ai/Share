import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import {MockRoutes} from '../BaseRoutesMock.test'
import IssueCard from './IssueCard'


test('IssueCard', () => {
  const id = 123
  const index = 123
  render(<MockRoutes contentElt={<IssueCard id={id} index = {index} title = "new_title" />}/>)
  expect(screen.getByText('new_title')).toBeInTheDocument()
})


test('IssueCardComments', () => {
  const id = 123
  const index = 123
  render(<MockRoutes contentElt={<IssueCard id={id} index = {index} numberOfComments = {10} />}/>)
  expect(screen.getByText(10)).toBeInTheDocument()
})


test('Select the issue card', () => {
  const id = 123
  const index = 123
  const rendered = render(<MockRoutes contentElt={<IssueCard id={id} index = {index} title = "new_title" />}/>)
  const selectIssueButton = rendered.getByTestId('test-button')
  fireEvent.click(selectIssueButton)
  expect(selectIssueButton).not.toBeInTheDocument()
})


test('Camera Position', () => {
  const id = 123
  const index = 123
  const rendered = render(<MockRoutes contentElt={<IssueCard id={id} index = {index}
    embeddedUrl = " http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34" />}/>)
  const showCamera = rendered.getByTitle('Show the camera view')
  expect(showCamera).toBeInTheDocument()
})


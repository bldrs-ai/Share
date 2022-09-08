import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import SampleModelsControl from './SampleModelsControl'
import ShareMock from '../ShareMock'


test('renders sample models control', async () => {
  const rendered = render(<ShareMock><SampleModelsControl/></ShareMock>)
  const sampleModelsButton = screen.getByTitle('Browse Examples')
  fireEvent.mouseOver(sampleModelsButton)
  fireEvent.click(sampleModelsButton)

  const tooltip = await rendered.findByRole('tooltip')
  const dialogText = await screen.findByText('wiki')

  expect(sampleModelsButton).toBeInTheDocument()
  expect(tooltip).toBeInTheDocument()
  expect(dialogText).toBeVisible()
})

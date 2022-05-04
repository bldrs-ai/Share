import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import SampleModelsControl from './SampleModelsControl'
import {MockRoutes} from '../BaseRoutesMock.test'


test('renders sample models control', async () => {
  const rendered = render( <MockRoutes contentElt = {<SampleModelsControl/>} />)
  const sampleModelsButton = screen.getByTitle('Sample Models')
  fireEvent.mouseOver(sampleModelsButton)
  fireEvent.click(sampleModelsButton)

  const tooltip = await rendered.findByRole('tooltip')
  const dialogText = await screen.findByText('wiki')

  expect(sampleModelsButton).toBeInTheDocument()
  expect(tooltip).toBeInTheDocument()
  expect(dialogText).toBeVisible()
})

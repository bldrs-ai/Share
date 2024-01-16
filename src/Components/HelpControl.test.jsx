import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom/extend-expect'
import HelpControl from './HelpControl'
import ShareMock from '../ShareMock'


describe('HelpControl', () => {
  it('renders the first page of the HelpDialog', () => {
    const {getByTitle, getByText} = render(<ShareMock><HelpControl/></ShareMock>)
    const button = getByTitle('Help')
    fireEvent.click(button)
    const text = getByText('Study the model using standard sections')
    expect(text).toBeInTheDocument()
  })


  it('navigates to the next page when the next button is clicked', () => {
    const {getByTitle, getByText, getByTestId} = render(<ShareMock><HelpControl/></ShareMock>)
    const button = getByTitle('Help')
    fireEvent.click(button)
    const nextPageButton = getByTestId('Next')
    fireEvent.click(nextPageButton)
    const text = getByText('Isolate selected element')
    expect(text).toBeInTheDocument()
  })
})

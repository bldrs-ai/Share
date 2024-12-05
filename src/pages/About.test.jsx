import React from 'react'
import {render} from '@testing-library/react'
import {HelmetThemeCtx} from '../Share.fixture'
import About from './About'


describe('About', () => {
  it('renders', () => {
    const {getByText} = render(<About/>, {wrapper: HelmetThemeCtx})
    const title = getByText('About Bldrs')
    expect(title).toBeInTheDocument()
  })
})

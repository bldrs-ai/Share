import React from 'react'
import {render} from '@testing-library/react'
import {HelmetThemeCtx} from '../Share.fixture'
import Privacy from './Privacy'


describe('Privacy', () => {
  it('renders', () => {
    const {container, getByText} = render(<Privacy/>, {wrapper: HelmetThemeCtx})
    const title = getByText('Privacy Policy')
    expect(title).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })
})

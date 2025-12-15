import React from 'react'
import {render} from '@testing-library/react'
import {HelmetThemeCtx} from '../Share.fixture'
import Terms from './TOS'


describe('Terms', () => {
  it('renders', () => {
    const {container, getByText} = render(<Terms/>, {wrapper: HelmetThemeCtx})
    const title = getByText('Terms of Service')
    expect(title).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })
})

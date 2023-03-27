import React from 'react'
import {render} from '@testing-library/react'
import Loader from './Loader'


describe('Loader', () => {
  it('renders', () => {
    const {container} = render(<Loader/>)
    expect(container.firstChild).toHaveClass('progress-bar')
  })
})

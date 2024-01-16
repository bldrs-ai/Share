import React from 'react'
import {render} from '@testing-library/react'
import {ThemeLogoB, ThemeLogoBWithDomain} from './Logo.fixture'


describe('Logos', () => {
  test('LogoB renders', () => {
    const {container} = render(<ThemeLogoB/>)
    expect(container.querySelector('svg')).not.toBeNull()
  })


  test('LogoBWithDomainIcon renders', () => {
    const {container} = render(<ThemeLogoBWithDomain/>)
    expect(container.querySelector('svg')).not.toBeNull()
    // TODO(pablo): test for smth like expect(svg.children[1]).toBe('BLDRS.AI')
  })
})

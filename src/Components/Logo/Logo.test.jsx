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
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    // TODO(pablo): figure out how to get the svg content to load and
    // then test for smth like
    // expect(svg.children[1]).toBe('BLDRS.AI')
  })
})

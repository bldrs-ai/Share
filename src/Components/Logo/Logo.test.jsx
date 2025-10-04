import React from 'react'
import {render} from '@testing-library/react'
import {ThemeProvider} from '@mui/material/styles'
import {createTheme} from '@mui/material/styles'
import {ThemeLogoB, ThemeLogoBWithDomain} from './Logo.fixture'
import {LogoB} from './Logo'


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


  test('LogoB renders with incomplete theme (missing logo palette)', () => {
    // Simulate a theme without the logo palette to fix race condition
    const incompleteTheme = createTheme({
      palette: {
        mode: 'light',
        primary: {main: '#1976d2'},
        secondary: {main: '#dc004e'},
        // Missing logo palette
      },
    })

    const {container} = render(
      <ThemeProvider theme={incompleteTheme}>
        <LogoB/>
      </ThemeProvider>,
    )

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    // Should not throw an error even with incomplete theme
  })
})

'use client'
import {Roboto} from 'next/font/google'
import {createTheme} from '@mui/material/styles'


const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
})


// Brand accents. Pulled from PR #1473 which is the current marketing
// design direction: pure lime + cyan on near-black. LIME is the CSS named
// `lime` (#00FF00) as hex — MUI's palette utilities can't parse named
// colors. LIME_HOVER (#A0FF00) is the slightly darker shade used for button
// hover.
export const LIME = '#00FF00'
export const LIME_HOVER = '#A0FF00'
export const CYAN = '#00F0FF'
export const CYAN_HOVER = '#00D4E0'

/**
 * Marketing theme. Dark-default with lime/cyan accents — visual direction
 * carried over from PR #1473. The viewer SPA has its own MUI theme; this one
 * intentionally does not import from there so the marketing build stays
 * independent.
 */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {main: LIME, contrastText: '#000000'},
    secondary: {main: CYAN, contrastText: '#000000'},
    background: {default: '#0A0A0A', paper: '#121212'},
  },
  typography: {
    fontFamily: roboto.style.fontFamily,
    h1: {fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15},
    h2: {fontSize: 'clamp(2rem, 4vw, 3.2rem)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15},
    h3: {fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2},
    h4: {fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.3},
    h5: {fontSize: '1.2rem', fontWeight: 700},
    h6: {fontSize: '1.05rem', fontWeight: 600},
    body1: {fontSize: '1.05rem', lineHeight: 1.7},
    body2: {fontSize: '0.95rem', lineHeight: 1.65},
    overline: {letterSpacing: 2, fontWeight: 700},
  },
  shape: {borderRadius: 10},
  components: {
    MuiButton: {
      styleOverrides: {
        root: {textTransform: 'none', fontWeight: 600},
      },
    },
    MuiLink: {
      defaultProps: {underline: 'hover'},
      styleOverrides: {
        root: {color: LIME},
      },
    },
  },
})

'use client'
import {Roboto} from 'next/font/google'
import {createTheme} from '@mui/material/styles'


const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
})


/**
 * Marketing theme. Dark-default with lime/cyan accents — visual direction
 * carried over from PR #1473. The viewer SPA has its own MUI theme; this one
 * intentionally does not import from there so the marketing build stays
 * independent.
 */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {main: '#A0FF00', contrastText: '#000000'},
    secondary: {main: '#00F0FF', contrastText: '#000000'},
    background: {default: '#0A0A0A', paper: '#121212'},
  },
  typography: {
    fontFamily: roboto.style.fontFamily,
    h1: {fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15},
    h2: {fontSize: 'clamp(1.6rem, 3.5vw, 2.25rem)', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2},
    h3: {fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.3},
    h4: {fontSize: '1.15rem', fontWeight: 600},
    body1: {fontSize: '1.05rem', lineHeight: 1.7},
    body2: {fontSize: '0.95rem', lineHeight: 1.65},
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
        root: {color: '#A0FF00'},
      },
    },
  },
})

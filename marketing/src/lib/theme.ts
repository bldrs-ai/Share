'use client'
import {Roboto} from 'next/font/google'
import {createTheme, type Theme, type ThemeOptions} from '@mui/material/styles'


const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
})


// Marketing brand accents — preserved in night mode. Day mode uses the SPA's
// muted tokens (grey/dark-blue) instead, per the design choice to "mirror
// the SPA's day palette" for visual continuity with the viewer.
export const LIME = '#00FF00'
export const LIME_HOVER = '#A0FF00'
export const CYAN = '#00F0FF'
export const CYAN_HOVER = '#00D4E0'

// SPA day tokens — values pulled from src/theme/Palette.js + src/theme/Colors.js
// so the marketing day mode reads the same as the viewer's day mode.
const SPA_DAY_PRIMARY = '#4444ff'      // colors.blue.darkest — SPA's accent.main
const SPA_DAY_PRIMARY_HOVER = '#2222cc' // accent.dark
const SPA_DAY_TEXT = '#101010'         // colors.grey.darkest
const SPA_DAY_BG = '#ffffff'
const SPA_DAY_PAPER = '#fafafa'


const sharedTypography: ThemeOptions['typography'] = {
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
}


export const nightTheme: Theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {main: LIME, contrastText: '#000000'},
    secondary: {main: CYAN, contrastText: '#000000'},
    background: {default: '#0A0A0A', paper: '#121212'},
  },
  typography: sharedTypography,
  shape: {borderRadius: 10},
  components: {
    MuiButton: {
      styleOverrides: {root: {textTransform: 'none', fontWeight: 600}},
    },
    MuiLink: {
      defaultProps: {underline: 'hover'},
      styleOverrides: {root: {color: LIME}},
    },
    MuiAppBar: {
      styleOverrides: {root: {backgroundColor: '#000000', color: '#ffffff'}},
    },
  },
})


export const dayTheme: Theme = createTheme({
  palette: {
    mode: 'light',
    primary: {main: SPA_DAY_PRIMARY, dark: SPA_DAY_PRIMARY_HOVER, contrastText: '#ffffff'},
    secondary: {main: CYAN, contrastText: SPA_DAY_TEXT},
    background: {default: SPA_DAY_BG, paper: SPA_DAY_PAPER},
    text: {primary: SPA_DAY_TEXT},
  },
  typography: sharedTypography,
  shape: {borderRadius: 10},
  components: {
    MuiButton: {
      styleOverrides: {root: {textTransform: 'none', fontWeight: 600}},
    },
    MuiLink: {
      defaultProps: {underline: 'hover'},
      styleOverrides: {root: {color: SPA_DAY_PRIMARY}},
    },
    MuiAppBar: {
      styleOverrides: {root: {backgroundColor: SPA_DAY_BG, color: SPA_DAY_TEXT}},
    },
  },
})

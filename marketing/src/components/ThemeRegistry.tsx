'use client'
import {ReactNode} from 'react'
import {ThemeProvider} from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import {theme} from '@/lib/theme'


/**
 * Client wrapper that injects MUI's ThemeProvider + CssBaseline. The root
 * layout (server component) wraps this in AppRouterCacheProvider, which
 * gives emotion a stable cache between server render and hydration so we
 * don't get the FOUC / style-mismatch dance.
 */
export default function ThemeRegistry({children}: {children: ReactNode}) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme/>
      {children}
    </ThemeProvider>
  )
}

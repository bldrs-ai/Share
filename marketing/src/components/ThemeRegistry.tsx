'use client'
import {ReactNode} from 'react'
import {ThemeProvider} from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import {dayTheme, nightTheme} from '@/lib/theme'
import {Themes} from '@/lib/colorMode'
import ColorModeProvider, {useEffectiveMode} from './ColorModeProvider'


function ThemedShell({children}: {children: ReactNode}) {
  const effective = useEffectiveMode()
  const active = effective === Themes.Night ? nightTheme : dayTheme
  return (
    <ThemeProvider theme={active}>
      <CssBaseline enableColorScheme/>
      {children}
    </ThemeProvider>
  )
}


/**
 * Client wrapper that injects ColorMode state and the matching MUI theme.
 * The root layout (server component) wraps this in AppRouterCacheProvider so
 * emotion has a stable cache between the static render and hydration. The
 * initial paint is driven by the inline script in layout.tsx setting
 * data-color-mode on <html>; this provider takes over after hydration.
 */
export default function ThemeRegistry({children}: {children: ReactNode}) {
  return (
    <ColorModeProvider>
      <ThemedShell>{children}</ThemedShell>
    </ColorModeProvider>
  )
}

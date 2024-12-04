import React, {ReactElement} from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import {ThemeProvider} from '@mui/material/styles'
import Styles from '../Styles'
import useShareTheme from './Theme'


/**
 * Mirrors the Theme setup for Share, including Css, Theme and Styles.
 *
 * @property {Array.<ReactElement>} children Wrapped elts
 * @return {ReactElement}
 */
export function ThemeCtx({children}) {
  const theme = useShareTheme()
  return (
    <CssBaseline enableColorScheme>
      <ThemeProvider theme={theme}>
        <Styles theme={theme}/>
        {children}
      </ThemeProvider>
    </CssBaseline>
  )
}

import React from 'react'
import {HelmetProvider} from 'react-helmet-async'
import CssBaseline from '@mui/material/CssBaseline'
import {ThemeProvider} from '@mui/material/styles'
import useShareTheme from './theme/Theme'
import Styles from './Styles'


/**
 * Mirrors the context setup for Share.
 *
 * @param {object} props
 * @return {React.Component}
 */
export default function FixtureContext(props) {
  const theme = useShareTheme()
  return (
    <HelmetProvider>
      <CssBaseline enableColorScheme>
        <ThemeProvider theme={theme}>
          <Styles theme={theme}/>
          {props.children}
        </ThemeProvider>
      </CssBaseline>
    </HelmetProvider>
  )
}

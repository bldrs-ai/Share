import React from 'react'
import {HelmetProvider} from 'react-helmet-async'
import CssBaseline from '@mui/material/CssBaseline'
import {ThemeProvider} from '@mui/material/styles'
import useShareTheme from '../../theme/Theme'
import Styles from '../../Styles'
import {AboutDialog} from './AboutControl'


/** @return {React.Component} */
export default function Example() {
  const theme = useShareTheme()
  return (
    <HelmetProvider>
      <CssBaseline enableColorScheme>
        <ThemeProvider theme={theme}>
          <Styles theme={theme}/>
          <AboutDialog
            isDialogDisplayed={true}
            // eslint-disable-next-line no-empty-function
            setIsDialogDisplayed={() => {}}
          />
        </ThemeProvider>
      </CssBaseline>
    </HelmetProvider>
  )
}

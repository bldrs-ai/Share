import React from 'react'
import {HelmetProvider} from 'react-helmet-async'
import {ThemeProvider} from '@mui/material/styles'
import useShareTheme from '../../theme/Theme'
import {AboutDialog} from './AboutControl'


/** @return {React.Component} */
export default function Example() {
  return (
    <HelmetProvider>
      <ThemeProvider theme={useShareTheme()}>
        <AboutDialog
          isDialogDisplayed={true}
          // eslint-disable-next-line no-empty-function
          setIsDialogDisplayed={() => {}}
        />
      </ThemeProvider>
    </HelmetProvider>
  )
}

import React, {useEffect} from 'react'
import {ThemeProvider} from '@mui/material/styles'
import useStore from './store/useStore'
import {ColorModeContext} from './Context/ColorMode'
import useTheme from './Theme'
import BaseRoutesMock from './BaseRoutesMock.test'


/**
 * Mocks the root Share react component.
 *
 * @return {React.ReactElement} React component.
 */
export default function ShareMock({initialEntries, children} = {}) {
  const {theme, colorMode} = useTheme()
  const setRepository = useStore((state) => state.setRepository)
  useEffect(() => {
    setRepository('pablo-mayrgundter', 'Share')
  }, [setRepository])

  return (
    <BaseRoutesMock
      initialEntries={initialEntries}
      contentElt={
        <ColorModeContext.Provider value={colorMode}>
          <ThemeProvider theme={theme}>
            {children}
          </ThemeProvider>
        </ColorModeContext.Provider>
      }
    />
  )
}

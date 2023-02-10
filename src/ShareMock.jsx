import React, {useEffect} from 'react'
import {ThemeProvider} from '@mui/material/styles'
import useStore from './store/useStore'
import useShareTheme from './theme/Theme'
import BaseRoutesMock from './BaseRoutesMock.test'


/**
 * Mocks the root Share react component.
 *
 * @property {Array} initialEntries For react-router MemoryRouter.
 * @property {object} children Of this component.
 * @return {React.Component}
 */
export default function ShareMock({initialEntries, children} = {}) {
  const setRepository = useStore((state) => state.setRepository)
  useEffect(() => {
    setRepository('pablo-mayrgundter', 'Share')
  }, [setRepository])

  return (
    <BaseRoutesMock
      initialEntries={initialEntries}
      contentElt={
        <ThemeProvider theme={useShareTheme()}>
          {children}
        </ThemeProvider>
      }
    />
  )
}

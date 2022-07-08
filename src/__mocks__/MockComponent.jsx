import useTheme from '../Theme'
import {ThemeProvider} from '@mui/material/styles'
import React, {createContext} from 'react'


/**
 * @param {Object} children React component(s)
 * @return {Object} React component
 */
export const MockComponent = ({children}) => {
  const {theme, colorMode} = useTheme()

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  )
}

const ColorModeContext = createContext({
  toggleColorMode: () => {},
})


export const MOCK_SELECTED_ELEMENT = {
  expressID: 396,
  type: 1095909175,
  GlobalId: {
    type: 1,
    value: '3qoAS2W2r7m9vxQ0sGR5Rc',
  },
  OwnerHistory: {
    type: 5,
    value: 28,
  },
  Name: {
    type: 1,
    value: 'Together',
  },
  Description: null,
  ObjectType: null,
  ObjectPlacement: {
    type: 5,
    value: 334,
  },
  Representation: {
    type: 5,
    value: 386,
  },
  Tag: {
    type: 1,
    value: 'F4C8A702-802D-47C0-9E7B-680D906C56E6',
  },
  PredefinedType: {
    type: 3,
    value: 'NOTDEFINED',
  },
}

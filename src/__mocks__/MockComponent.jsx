import React from 'react'
import {ThemeProvider} from '@mui/material/styles'
import useShareTheme from '../theme/Theme'
import {HelmetProvider} from 'react-helmet-async'


/**
 * @property {object} children React component(s)
 * @return {React.Component}
 */
export const MockComponent = ({children}) => {
  return (
    <HelmetProvider>
      <ThemeProvider theme={useShareTheme()}>
        {children}
      </ThemeProvider>
    </HelmetProvider>
  )
}

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

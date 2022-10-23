import {createContext} from 'react'
import {addDecorator} from '@storybook/react'
import {ThemeProvider} from '@mui/material/styles'
import useTheme from '../src/Theme'

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
}

export const decorators = [
  (Story) => {
    const {theme, colorMode} = useTheme()
    const ColorModeContext = createContext({toggleColorMode: () => {}})

    return (
        <ColorModeContext.Provider value={colorMode}>
        <ThemeProvider theme={theme}>
        {Story()}
      </ThemeProvider>
        </ColorModeContext.Provider>
    )
  }
]


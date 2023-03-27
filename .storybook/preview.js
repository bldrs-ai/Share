import {createContext} from 'react'
import {addDecorator} from '@storybook/react'
import {ThemeProvider} from '@mui/material/styles'
import useShareTheme from '../src/theme/Theme'


export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
}


addDecorator((Story) => {
  return (
    <ThemeProvider theme={useShareTheme()}>
      {Story()}
    </ThemeProvider>
  )
})

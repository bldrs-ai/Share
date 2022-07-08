import React, {createContext} from 'react'
import {ThemeProvider} from '@mui/material/styles'
import useTheme from './Theme'
import {render} from '@testing-library/react'
import {MemoryRouter, Routes, Route} from 'react-router-dom'


test('mockRoutes', () => {
  const testLabel = 'Test node label'
  const {getByText} = render(<MockRoutes contentElt={testLabel}/>)
  expect(getByText(testLabel)).toBeInTheDocument()
})


const ColorModeContext = createContext({toggleColorMode: () => {}})

/**
 * @param {Object} contentElt React component
 * @return {Object} React component
 */
export function MockRoutes({contentElt}) {
  return (
    <MockElement>
      <MemoryRouter>
        <Routes>
          <Route path="/*" element={contentElt}/>
        </Routes>
      </MemoryRouter>
    </MockElement>
  )
}

export const MockElement = ({children}) => {
  const {theme, colorMode} = useTheme()

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  )
}

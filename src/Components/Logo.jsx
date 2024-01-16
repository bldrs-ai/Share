import React from 'react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import LogoBIcon from '../assets/LogoB.svg'
import LogoBWithDomainIcon from '../assets/LogoBWithDomain.svg'


/** @return {React.Element} */
export function LogoB() {
  return (
    <ThemeBox>
      <LogoBIcon/>
    </ThemeBox>
  )
}


/** @return {React.Element} */
export function LogoBWithDomain() {
  return (
    <ThemeBox>
      <LogoBWithDomainIcon/>
    </ThemeBox>
  )
}


/**
 * @property {Array.<React.Element>} children The logo
 * @return {React.Element}
 */
function ThemeBox({children}) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        'width': '70px',
        'margin': '0 auto',
        '& svg': {
          '& text': {
            fill: theme.palette.primary.contrastText,
          },
          '& .face': {
            stroke: theme.palette.primary.contrastText,
          },
        },
      }}
    >
      {children}
    </Box>
  )
}

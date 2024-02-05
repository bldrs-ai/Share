import React from 'react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import LogoBIcon from '../../assets/LogoB.svg'
import LogoBWithDomainIcon from '../../assets/LogoBWithDomain.svg'


/** @return {React.ReactElement} */
export function LogoB() {
  return (
    <ThemeBox>
      <LogoBIcon/>
    </ThemeBox>
  )
}


/** @return {React.ReactElement} */
export function LogoBWithDomain() {
  const theme = useTheme()
  return (
    <ThemeBox>
      <LogoBWithDomainIcon
        sx={{
          '& svg': {
            '& text': {
              // We're currently only showing Logo in dialogs, etc. so
              // use secondary contrastText
              fill: theme.palette.secondary.contrastText,
            },
          },
        }}
      />
    </ThemeBox>
  )
}


/**
 * @property {Array.<React.ReactElement>} children The logo
 * @return {React.ReactElement}
 */
function ThemeBox({children}) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        'width': '70px',
        'margin': '0 auto',
        '& svg': {
          '& .face-left': {
            fill: theme.palette.logo.leftFace,
          },
          '& .face-front': {
            fill: theme.palette.logo.frontFace,
          },
        },
      }}
    >
      {children}
    </Box>
  )
}

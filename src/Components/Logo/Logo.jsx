import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/material/styles'
import LogoBIcon from '../../assets/LogoB.svg'
import LogoBWithDomainIcon from '../../assets/LogoBWithDomain.svg'


/** @return {ReactElement} */
export function LogoB() {
  return (
    <ThemeBox>
      <LogoBIcon className='icon-share'/>
    </ThemeBox>
  )
}


/** @return {ReactElement} */
export function LogoBWithDomain() {
  const theme = useTheme()
  // We're currently only showing Logo in dialogs, etc. so
  // use secondary contrastText
  return (
    <ThemeBox>
      <LogoBWithDomainIcon
        className='icon-share'
        style={{
          fill: theme.palette.secondary.contrastText,
          width: '4em',
          height: '4em',
        }}
      />
    </ThemeBox>
  )
}


/**
 * @property {Array.<ReactElement>} children The logo
 * @return {ReactElement}
 */
function ThemeBox({children}) {
  const theme = useTheme()
  return (
    <Box
      sx={{
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

import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import SvgIcon from '@mui/material/SvgIcon'
import {useTheme} from '@mui/material/styles'
import LogoBIcon from '../../assets/LogoB.svg'
import LogoBWithDomainIcon from '../../assets/LogoBWithDomain.svg'


/** @return {ReactElement} */
export function LogoB() {
  return (
    <ThemeBox>
      <SvgIcon><LogoBIcon className='icon-share'/></SvgIcon>
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
      <SvgIcon>
        <LogoBWithDomainIcon
          className='icon-share'
          style={{
            fill: theme.palette.secondary.contrastText,
            width: '4em',
            height: '4em',
          }}
        />
      </SvgIcon>
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

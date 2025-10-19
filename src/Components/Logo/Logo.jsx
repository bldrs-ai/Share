import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import SvgIcon from '@mui/material/SvgIcon'
import {useTheme} from '@mui/material/styles'
import LogoBIcon from '../../assets/LogoB.svg'
import LogoBWithDomainIcon from '../../assets/LogoBWithDomain.svg'


/** @return {ReactElement} */
export function LogoB({...props}) {
  return (
    <ThemeBox>
      <LogoBIcon className='icon-share'/>
    </ThemeBox>
  )
}


/** @return {ReactElement} */
export function LogoBWithDomain({...props}) {
  const {theme} = useThemeWithLogo()
  // We're currently only showing Logo in dialogs, etc. so
  // use secondary contrastText
  return (
    <ThemeBox>
      <SvgIcon
        fontSize='large'
        {...props}
      >
        <LogoBWithDomainIcon
          className='icon-share'
          style={{
            fill: theme?.palette?.secondary?.contrastText || '#000000',
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
  const {logoColors} = useThemeWithLogo()

  return (
    <Box
      sx={{
        'margin': '0 auto',
        '& svg': {
          '& .face-left': {
            fill: logoColors.leftFace,
          },
          '& .face-front': {
            fill: logoColors.frontFace,
          },
        },
      }}
    >
      {children}
    </Box>
  )
}


/**
 * Custom hook to ensure theme is ready with logo palette
 *
 * @return {object} theme with guaranteed logo palette
 */
function useThemeWithLogo() {
  const theme = useTheme()

  // Check if theme and logo palette are properly initialized
  const isThemeReady = theme && theme.palette && theme.palette.logo

  return {
    theme,
    isThemeReady,
    logoColors: theme?.palette?.logo || {
      leftFace: 'lime', // fallback to default
      frontFace: 'white', // fallback to default
    },
  }
}

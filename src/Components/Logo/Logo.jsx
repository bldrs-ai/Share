import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/material/styles'
import LogoBIcon from '../../assets/LogoB.svg'
import LogoBWithDomainIcon from '../../assets/LogoBWithDomain.svg'
import SvgIcon from '@mui/material/SvgIcon'


/** @return {ReactElement} */
export function LogoB({...props}) {
  return (
    <ThemeBox>
      <SvgIcon
        component={LogoBIcon}
        inheritViewBox={true}
        className='icon-share'
        {...props}
      />
    </ThemeBox>
  )
}


/**
 * @param {object} props
 * @return {ReactElement}
 */
export function LogoBWithDomain({...props}) {
  return (
    <ThemeBox>
      <SvgIcon
        component={LogoBWithDomainIcon}
        inheritViewBox={true}
        className='icon-share'
        {...props}
      />
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

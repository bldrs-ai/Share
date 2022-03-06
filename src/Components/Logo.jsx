import React from 'react'
import LogoIcon from '../assets/2D_Icons/Logo.svg'
import {makeStyles, useTheme} from '@mui/styles'


/**
 * @return {Object} React component
 */
export default function Logo() {
  const classes = useStyles(useTheme())
  return (
    <LogoIcon className={classes.logo}/>
  )
}


const useStyles = makeStyles((theme) => ({
  logo: {
    'position': 'fixed',
    'bottom': '20px',
    'left': '30px',
    'width': '140px',
    '@media (max-width: 900px)': {
      position: 'fixed',
      bottom: '20px',
      left: '26px',
      width: '120px',
    },
    '& .left-face': {
      fill: theme.palette.logo.leftFace,
    },
    '& .right-face': {
      fill: theme.palette.logo.rightFace,
    },
    '& .edges': {
      stroke: theme.palette.logo.edges,
    },
  },
}))

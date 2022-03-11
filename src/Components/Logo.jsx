import React from 'react'
import LogoIcon from '../assets/2D_Icons/Logo.svg'
import {makeStyles, useTheme} from '@mui/styles'


/**
 * @param {function} onClick function triggered when logo is cliked
 * @return {Object} React component
 */
export default function Logo({onClick}) {
  const classes = useStyles(useTheme())
  return (
    <LogoIcon className={classes.logo} onClick = {onClick}/>
  )
}


const useStyles = makeStyles((theme) => ({
  logo: {
    'position': 'fixed',
    'bottom': '20px',
    'paddingBottom': '3px',
    'left': '30px',
    'width': '140px',
    'cursor':'pointer',
    '@media (max-width: 900px)': {
      position: 'fixed',
      bottom: '20px',
      left: '26px',
      width: '120px',
    },
    '@media (max-width: 350px)': {
      display: 'none',
    },
    '& .left-face': {
      fill: theme.palette.primary.light,
    },
    '& .right-face': {
      fill: theme.palette.primary.dark,
    },
    '& .edges': {
      stroke: theme.palette.primary.main,
    },
  },
}))

import React from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles, useTheme} from '@mui/styles'
import LogoIcon from '../assets/LogoB_4.svg'
import PkgJson from '../../package.json'


/**
 * @param {Function} onClick function triggered when logo is cliked
 * @return {object} React component
 */
export default function Logo({onClick}) {
  const classes = useStyles(useTheme())
  return (
    <div className={classes.logoGroup}>
      {
        // vyzn customization: 
        // Hide the issues control.
      }
      Powered by <a href="https://bldrs.ai/">BLDRS</a>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  logoGroup: {
    'position': 'fixed',
    // vyzn customization: 
    // Move to the bottom since there is no issues control anymore.
    'bottom': '20px',
    'left': '20px',
    '& svg': {
      'width': '50px',
      '@media (max-width: 900px)': {
        width: '50px',
      },
      '& .left-face': {
        fill: theme.palette.primary.light,
      },
      '& .right-face': {
        fill: theme.palette.primary.dark,
      },
      '& .edges': {
        stroke: theme.palette.primary.contrastText,
      },
    },
  },
}))

import React from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles, useTheme} from '@mui/styles'
import LogoIcon from '../assets/LogoB_4.svg'
import PkgJson from '../../package.json'


/**
 * @property {Function} onClick function triggered when logo is cliked
 * @return {React.ReactElement} React component
 */
export default function Logo({onClick}) {
  const classes = useStyles(useTheme())
  return (
    <div className={classes.logoGroup}>
      <Tooltip title={`Bldrs: ${PkgJson.version}`} describeChild placement="right">
        <IconButton disableRipple onClick={onClick}>
          <LogoIcon/>
        </IconButton>
      </Tooltip>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  logoGroup: {
    'position': 'fixed',
    'bottom': '-60px',
    'left': '12px',
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

import React from 'react'
// import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles, useTheme} from '@mui/styles'
import {assertDefined} from '../utils/assert'


/**
 * @param {Object} icon
 * @param {Boolean} state
 * @return {Object} React component
 */
export function TooltipToggleButton({icon, state, onClick, title = 'title', placement = 'left'}) {
  assertDefined(icon)
  const classes = useStyles(useTheme())
  return (
    <div className={classes.root}>
      <Tooltip title={title} describeChild placement={placement}>
        <ToggleButton
          selected={state}
          onClick={onClick}
          color='primary'
        >
          {icon}
        </ToggleButton>
      </Tooltip>
    </div>
  )
}

/**
 * A FormButton is a TooltipIconButton but with parameterized type for
 * form actions.
 * @param {string} title
 * @param {Object} icon
 * @param {string} type Type of button (and icon to render)
 * @param {string} placement Placement of tooltip
 * @param {string} size Size of button component
 * @return {Object} React component
 */
export function RectangularButton({
  title,
  icon,
}) {
  assertDefined(title, icon)
  return (
    <Button
      variant='rectangular'
      startIcon={icon}
      sx={{
        '& .MuiButton-startIcon': {position: 'absolute', left: '20px'},
        '&.MuiButtonBase-root:hover': {bgcolor: 'none'},
      }}
    >
      {title}
    </Button>
  )
}


const useStyles = makeStyles((theme) => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    opacity: .9,
    height: '340px',
  },
  root: {
    '& button': {
      'width': '40px',
      'height': '40px',
      'border': 'none',
      '&.Mui-selected, &.Mui-selected:hover': {
        backgroundColor: '#97979770',
      },
    },
    '& svg': {
      width: '20px',
      height: '20px',
      fill: theme.palette.primary.contrastText,
    },
  },
}))


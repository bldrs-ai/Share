import React from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import ToggleButton from '@mui/material/ToggleButton'
import useTheme from '@mui/styles/useTheme'
import {assertDefined} from '../utils/assert'
import {useIsMobile} from './Hooks'


/**
 * @param {string} title Tooltip text
 * @param {Function} onClick
 * @param {object} icon
 * @param {string} placement
 * @param {boolean} selected
 * @param {string} dataTestId Internal attribute for component testing
 * @return {React.Component} React component
 */
export function TooltipIconButton({title, onClick, icon, placement = 'left', selected = false}) {
  assertDefined(icon, onClick, title)
  const theme = useTheme()
  const isMobile = useIsMobile()


  return (
    <Box sx={{
      '& button': {
        'width': '40px',
        'height': '40px',
        'border': 'none',
        'margin': '4px 0px 4px 0px',
        '&.Mui-selected, &.Mui-selected:hover': {
          backgroundColor: '#97979720',
        },
      },
      '& svg': {
        width: '22px',
        height: '22px',
        fill: theme.palette.primary.contrastText,
      },
    }}
    >
      {isMobile ?
        <ToggleButton
          selected={selected}
          onClick={onClick}
          color='primary'
          value={''}
        >
          {icon}
        </ToggleButton> :
        <Tooltip title={title} describeChild placement={placement} data-testid="test-button">
          <ToggleButton
            selected={selected}
            onClick={onClick}
            color='primary'
            value={''}
          >
            {icon}
          </ToggleButton>
        </Tooltip>
      }
    </Box>
  )
}


/**
 * A RectangularButton is used in dialogs
 *
 * @param {string} title
 * @param {object} icon
 * @param {string} type Type of button (and icon to render)
 * @param {string} placement Placement of tooltip
 * @param {string} size Size of button component
 * @return {object} React component
 */
export function RectangularButton({
  title,
  icon,
  onClick,
  noBorder = true,
  noBackground = false,
}) {
  assertDefined(title, icon, onClick)
  const theme = useTheme()
  return (
    <Button
      onClick={onClick}
      variant='rectangular'
      startIcon={icon}
      sx={{
        'border': `1px solid ${noBorder ? 'none' : theme.palette.highlight.heavy}`,
        'backgroundColor': noBackground ? 'none' : theme.palette.highlight.main,
        '& .MuiButton-startIcon': {position: 'absolute', left: '20px'},
        '&.MuiButtonBase-root:hover': {bgcolor: theme.palette.highlight.secondary},
      }}
    >
      {title}
    </Button>
  )
}


/**
 * @param {string} title The text for tooltip
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @param {object} icon The header icon
 * @param {string} placement Default: left
 * @param {string} size Size of button component
 * @param {object} dialog The controlled dialog
 * @return {React.Component} React component
 */
export function ControlButton({
  title,
  isDialogDisplayed,
  setIsDialogDisplayed,
  icon,
  placement = 'left',
  dialog,
  state = false,
}) {
  assertDefined(title, isDialogDisplayed, setIsDialogDisplayed, icon, dialog)
  const theme = useTheme()


  return (
    <Box>
      <Box sx={{
        '& button': {
          'width': '40px',
          'height': '40px',
          'border': 'none',
          'margin': '4px 0px 4px 0px',
          '&.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: '#97979720',
          },
        },
        '& svg': {
          width: '22px',
          height: '22px',
          fill: theme.palette.primary.contrastText,
        },
      }}
      >
        <Tooltip title={title} describeChild placement={placement}>
          <ToggleButton
            sx={{
              '& button': {
                'width': '40px',
                'height': '40px',
                'border': 'none',
                'margin': '4px 0px 4px 0px',
                '&.Mui-selected, &.Mui-selected:hover': {
                  backgroundColor: '#97979720',
                },
              },
              '& svg': {
                width: '22px',
                height: '22px',
                fill: theme.palette.primary.contrastText,
              },
            }}
            selected={isDialogDisplayed}
            onClick={() => {
              setIsDialogDisplayed(true)
            }}
            color='primary'
            value={''}
          >
            {icon}
          </ToggleButton>
        </Tooltip>
      </Box>
      {isDialogDisplayed && dialog}
    </Box>
  )
}

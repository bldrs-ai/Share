import React from 'react'
import Box from '@mui/material/Box'
import MuiDrawer from '@mui/material/Drawer'
import Typography from '@mui/material/Typography'
import {preprocessMediaQuery} from '../../utils/mediaQuery'
import {MOBILE_WIDTH} from '../../utils/constants'
import {TooltipIconButton} from '../Buttons'
import CloseIcon from '../../assets/icons/Close.svg'
import {assertDefined} from '../../utils/assert'


/**
 * PropertiesDrawer contains the ItemPanel and allows for
 * show/hide from the right of the screen.
 *
 * @property {string} title Title for the drawer
 * @property {object} content The contained ItemPanel
 * @property {Function} onClose Callback
 * @return {object} PropertiesDrawer react component
 */
export default function Drawer({
  title,
  content,
  onClose,
}) {
  assertDefined(title, content, onClose)
  return (
    <MuiDrawer
      sx={preprocessMediaQuery(MOBILE_WIDTH, {
        '& > .MuiPaper-root': {
          'width': '20em',
          // This lets the h1 in Properties use 1em padding but have
          // its mid-line align with the text in SearchBar
          'padding': '4px 1em',
          '@media (max-width: MOBILE_WIDTH)': {
            width: 'auto',
            height: '250px',
          },
        },
        '& .MuiPaper-root': {
          marginTop: '0px',
          borderRadius: '0px',
        },
      })}
      open={true}
      anchor={'right'}
      variant='persistent'
      elevation={4}
    >
      <Box sx={preprocessMediaQuery(MOBILE_WIDTH, {
        'display': 'flex',
        'justifyContent': 'space-between',
        'alignItems': 'center',
        'margin': '1em 0',
        '@media (max-width: MOBILE_WIDTH)': {
          borderBottom: 'none',
          height: '20px',
        },
      })}
      >
        <Typography variant='body1'>{title}</Typography>
        <TooltipIconButton
          title='Close properties'
          onClick={onClose}
          icon={<CloseIcon/>}
        />
      </Box>
      <Box sx={preprocessMediaQuery(MOBILE_WIDTH, {
        'overflow': 'auto',
        'height': '90%',
        '@media (max-width: MOBILE_WIDTH)': {
          overflow: 'auto',
        },
      })}
      >
        {content}
      </Box>
    </MuiDrawer>
  )
}

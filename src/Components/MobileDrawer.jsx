import React, {useState} from 'react'
import Box from '@mui/material/Box'
import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import {useTheme} from '@mui/styles'
import useStore from '../store/useStore'
import {preprocessMediaQuery} from '../utils/mediaQuery'
import {MOBILE_WIDTH} from './Hooks'
import {TooltipIconButton} from './Buttons'
import CaretIcon from '../assets/2D_Icons/Caret.svg'


const drawerBleeding = 300


/**
 * @param {object} content React component to be wrapped
 * @return {object} React component
 */
export default function MobileDrawer({content}) {
  const [open, setOpen] = useState(true)
  const toggleDrawer = () => setOpen(!open)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const openDrawer = useStore((state) => state.openDrawer)
  const theme = useTheme()


  return (
    <SwipeableDrawer
      sx={preprocessMediaQuery(MOBILE_WIDTH, {
        '&::-webkit-scrollbar': {
          display: 'none',
        },
        '& > .MuiPaper-root': {
          height: '100vh',
          // This lets the h1 in ItemProperties use 1em padding but have
          // its mid-line align with the text in SearchBar
          padding: '4px 1em',
        },
        '& .MuiPaper-root': {
          marginTop: '0px',
          borderRadius: '0px',
        },
      })}
      anchor='bottom'
      variant='persistent'
      open={open}
      onClose={closeDrawer}
      onOpen={openDrawer}
      swipeAreaWidth={drawerBleeding}
      disableSwipeToOpen={false}
    >
      <Box sx={{
        position: 'absolute',
        visibility: 'visible',
        top: open ? 0 : `-${drawerBleeding}px`,
        right: 0,
        left: 0,
        padding: '.5em',
        borderTopLeftRadius: '16px',
        borderTopRightRadius: '16px',
        backgroundColor: theme.palette.background.paper,
        overflowX: 'hidden',
        overflowY: 'auto',
        height: '100%',
      }}
      >
        <Box sx={{
          'display': 'flex',
          'justifyContent': 'center',
          'alignItems': 'center',
          '& svg': {
            transform: open ? 'none' : 'rotate(180deg)',
          },
        }}
        >
          <TooltipIconButton title='Expand' onClick={toggleDrawer} icon={<CaretIcon/>}/>
        </Box>
        {content}
      </Box>
    </SwipeableDrawer>
  )
}

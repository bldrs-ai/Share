import React, {useState} from 'react'
import Box from '@mui/material/Box'
import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import {styled} from '@mui/material/styles'
import {makeStyles} from '@mui/styles'
import {TooltipIconButton} from './Buttons'
import CaretIcon from '../assets/2D_Icons/Caret.svg'


/**
 * @param {Object} content React component to be wrapped
 * @return {Object} React component
 */
export default function MobileDrawer({content}) {
  const [open, setOpen] = useState(false)
  const toggleDrawer = () => setOpen(!open)
  const classes = useStyles({isOpen: open})
  return (
    <div className={classes.swipeDrawer}>
      <SwipeableDrawer
        anchor='bottom'
        variant='persistent'
        open={open}
        onClose={toggleDrawer}
        onOpen={toggleDrawer}
        swipeAreaWidth={drawerBleeding}
        disableSwipeToOpen={false}>
        <StyledBox className={classes.contentContainer}>
          <div className={classes.openToggle}>
            <TooltipIconButton title='Expand' onClick={toggleDrawer} icon={<CaretIcon/>}/>
          </div>
          {content}
        </StyledBox>
      </SwipeableDrawer>
    </div>
  )
}


const drawerBleeding = 220


const StyledBox = styled(Box)(({theme}) => ({
  backgroundColor: theme.palette.background.paper,
  overflowY: 'scroll',
}))


const useStyles = makeStyles((props) => ({
  swipeDrawer: {
    '& .MuiDrawer-root': {
      height: '100%',
    },
    '& .MuiDrawer-root > .MuiPaper-root': {
      // TODO(pablo): Workaround bug..
      // https://github.com/mui/material-ui/issues/16942
      height: '100%',
      overflow: (props) => props.isOpen ? 'scroll' : 'visible',
    },
  },
  openToggle: {
    'position': 'absolute',
    'right': '1.25em',
    'top': '0.5em',
    '& svg': {
      transform: (props) => props.isOpen ? 'none' : 'rotate(180deg)',
    },
  },
  contentContainer: {
    position: 'absolute',
    visibility: 'visible',
    top: (props) => props.isOpen ? '0px' : `-${drawerBleeding}px`,
    right: 0,
    left: 0,
    padding: '1em',
    borderTop: 'solid 1px grey',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
}))

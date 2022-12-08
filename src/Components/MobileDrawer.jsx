import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import {makeStyles} from '@mui/styles'
import {styled} from '@mui/material/styles'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import CaretIcon from '../assets/2D_Icons/Caret.svg'


/**
 * @property {React.ReactElement} content React component to be wrapped
 * @return {React.ReactElement} React component
 */
export default function MobileDrawer({content}) {
  const [open, setOpen] = useState(true)
  const toggleDrawer = () => setOpen(!open)
  const classes = useStyles({isOpen: open})
  const closeDrawer = useStore((state) => state.closeDrawer)
  const openDrawer = useStore((state) => state.openDrawer)

  return (
    <Paper className={classes.swipeDrawer}>
      <SwipeableDrawer
        anchor='bottom'
        variant='persistent'
        open={open}
        onClose={closeDrawer}
        onOpen={openDrawer}
        swipeAreaWidth={drawerBleeding}
        disableSwipeToOpen={false}
      >
        <StyledBox className={classes.contentContainer}>
          <div className={classes.openToggle}>
            <TooltipIconButton title='Expand' onClick={toggleDrawer} icon={<CaretIcon/>}/>
          </div>
          {content}
        </StyledBox>
      </SwipeableDrawer>
    </Paper>
  )
}


const drawerBleeding = 300


const StyledBox = styled(Box)(({theme}) => ({
  backgroundColor: theme.palette.background.paper,
  overflowY: 'scroll',
}))


const useStyles = makeStyles((props) => ({
  swipeDrawer: {
    '& .MuiDrawer-root': {
      height: '100%',
      border: 'none',
      opacity: .95,
    },
    '& .MuiDrawer-root > .MuiPaper-root': {
      // TODO(pablo): Workaround bug..
      // https://github.com/mui/material-ui/issues/16942
      height: '100%',
      overflow: (p) => p.isOpen ? 'scroll' : 'visible',
    },
  },
  openToggle: {
    'display': 'flex',
    'justifyContent': 'center',
    'alignItems': 'center',
    '& svg': {
      transform: (p) => p.isOpen ? 'none' : 'rotate(180deg)',
    },
  },
  iconContainer: {
    position: 'absolute',
    left: '0.8em',
    top: '.2em',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  contentContainer: {
    position: 'absolute',
    visibility: 'visible',
    top: (p) => p.isOpen ? '0px' : `-${drawerBleeding}px`,
    right: 0,
    left: 0,
    padding: '.5em',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
}))

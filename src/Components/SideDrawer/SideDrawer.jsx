import React, {useEffect, useRef} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import {useTheme} from '@mui/styles'
import OperationsGroup from '../../Components/OperationsGroup'
import {useIsMobile} from '../Hooks'
import {TooltipIconButton} from '../Buttons'
import useStore from '../../store/useStore'
import {getHashParams} from '../../utils/location'
import ResizerButton from './ResizerButton'
import {PropertiesPanel, NotesPanel} from './SideDrawerPanels'
import CaretIcon from '../../assets/2D_Icons/Caret.svg'


/**
 * SideDrawerWrapper is the container for the SideDrawer component.
 * it is loaded into the CadView, connected to the store and passes the props to the sideDrawer.
 * It makes it is possible to test Side Drawer outside of the cad view.
 *
 * @return {object} SideDrawer react component
 */
export default function SideDrawerWrapper({unSelectItem}) {
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const isCommentsOn = useStore((state) => state.isCommentsOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const turnCommentsOn = useStore((state) => state.turnCommentsOn)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const viewer = useStore((state) => state.viewer)
  const sidebarWidth = useStore((state) => state.sidebarWidth)
  const location = useLocation()
  const isMobile = useIsMobile()
  const theme = useTheme()
  const sidebarRef = useRef(null)


  useEffect(() => {
    const noteHash = getHashParams(location, 'i')
    if (noteHash !== undefined) {
      const extractedCommentId = noteHash.split(':')[1]
      setSelectedNoteId(Number(extractedCommentId))
      if (!isDrawerOpen) {
        openDrawer()
        turnCommentsOn()
      }
    }

    // This address bug #314 by clearing selected issue when new model is loaded
    if (noteHash === undefined && isDrawerOpen) {
      setSelectedNoteId(null)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, openDrawer, setSelectedNoteId])


  useEffect(() => {
    if (!isCommentsOn && !isPropertiesOn && isDrawerOpen) {
      closeDrawer()
    }
  }, [isCommentsOn, isPropertiesOn, isDrawerOpen, closeDrawer])

  console.log('contrastText', theme.palette.primary.contrastText)
  return (
    <Box
      sx={{
        position: 'absolute',
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        top: 0,
        right: 0,
      }}
    >
      {viewer && <OperationsGroup unSelectItem={unSelectItem}/>}
      <Paper
        sx={{
          display: isDrawerOpen ? 'flex' : 'none',
          width: isMobile ? '100vw' : sidebarWidth,
          minWidth: '8px',
          maxWidth: '100vw',
          height: '100%',
          flexDirection: 'row',
          borderLeft: 'grey 1px solid',
          borderRadius: 0,
        }}
        foo='bar'
        ref={sidebarRef}
        onMouseDown={(e) => e.preventDefault()}
      >
        <ResizerButton sidebarRef={sidebarRef}/>
        {/* Content */}
        <Box
          sx={{
            flexDirection: 'column',
            flex: 1,
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <Box
            sx={{
              'display': isMobile ? 'flex' : 'none',
              'justifyContent': 'center',
              'alignItems': 'center',
              '& svg': {
                transform: 'rotate(180deg)',
              },
            }}
          >
            <TooltipIconButton title='Expand' onClick={closeDrawer} icon={<CaretIcon/>}/>
          </Box>
          <Box
            sx={{
              display: isCommentsOn ? 'block' : 'none',
              height: isPropertiesOn ? '50%' : '100%',
              overflow: 'auto',
              padding: '1em 0',
            }}
          >
            {isCommentsOn && <NotesPanel/>}
          </Box>
          {isCommentsOn && isPropertiesOn && <Divider/>}
          <Box
            sx={{
              display: isPropertiesOn ? 'block' : 'none',
              padding: '1em 0',
            }}
          >
            {isPropertiesOn && <PropertiesPanel/>}
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}

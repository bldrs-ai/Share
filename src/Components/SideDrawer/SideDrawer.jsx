import React, {useEffect, useRef} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
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
  const isNotesOn = useStore((state) => state.isNotesOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const openNotes = useStore((state) => state.openNotes)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const viewer = useStore((state) => state.viewer)
  const sidebarWidth = useStore((state) => state.sidebarWidth)
  const location = useLocation()
  const isMobile = useIsMobile()
  const sidebarRef = useRef(null)


  useEffect(() => {
    const noteHash = getHashParams(location, 'i')
    if (noteHash !== undefined) {
      const extractedCommentId = noteHash.split(':')[1]
      setSelectedNoteId(Number(extractedCommentId))
      if (!isDrawerOpen) {
        openDrawer()
        openNotes()
      }
    }

    // This address bug #314 by clearing selected issue when new model is loaded
    if (noteHash === undefined && isDrawerOpen) {
      setSelectedNoteId(null)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, openDrawer, setSelectedNoteId])


  useEffect(() => {
    if (!isNotesOn && !isPropertiesOn && isDrawerOpen) {
      closeDrawer()
    }
  }, [isNotesOn, isPropertiesOn, isDrawerOpen, closeDrawer])


  const margin = '1em'
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
            margin: margin,
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
          {/* The height is calulated to align the Divider with the center of the drag button. */}
          <Box
            sx={{
              display: isNotesOn ? 'block' : 'none',
              height: isPropertiesOn ? `calc(50% - ${margin})` : '100%',
              overflow: 'auto',
            }}
          >
            {isNotesOn && <NotesPanel/>}
          </Box>
          {isNotesOn && isPropertiesOn && <Divider/>}
          <Box
            sx={{
              display: isPropertiesOn ? 'block' : 'none',
            }}
          >
            {isPropertiesOn && <PropertiesPanel/>}
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}

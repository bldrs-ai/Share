import React, {useEffect, useContext, useRef, useState} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/styles'
import OperationsGroup from '../../Components/OperationsGroup'
import {ColorModeContext} from '../../Context/ColorMode'
import useStore from '../../store/useStore'
import {getHashParams} from '../../utils/location'
import CaretIcon from '../../assets/2D_Icons/Caret.svg'
import {useIsMobile} from '../Hooks'
import {TooltipIconButton} from '../Buttons'
import {PropertiesPanel, NotesPanel} from './SideDrawerPanels'
import {dayColor, nightColor} from '../../utils/constants'


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
  const setSidebarWidth = useStore((state) => state.setSidebarWidth)
  const location = useLocation()
  const isMobile = useIsMobile()
  const theme = useTheme()
  const colorTheme = useContext(ColorModeContext)
  const sidebarRef = useRef(null)
  const [isResizing, setIsResizing] = useState(false)


  const startResizing = React.useCallback(() => {
    setIsResizing(true)
  }, [])


  const stopResizing = React.useCallback(() => {
    setIsResizing(false)
  }, [])


  const resize = React.useCallback(
      (mouseMoveEvent) => {
        if (isResizing) {
        // eslint-disable-next-line no-magic-numbers
          setSidebarWidth(sidebarRef.current.getBoundingClientRect().right - mouseMoveEvent.clientX + 4)
        }
      },
      [isResizing, setSidebarWidth],
  )


  useEffect(() => {
    window.addEventListener('mousemove', resize)
    window.addEventListener('mouseup', stopResizing)
    return () => {
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopResizing)
    }
  }, [resize, stopResizing])


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


  return (
    <Box
      sx={{
        position: 'absolute',
        display: 'flex',
        borderLeft: 'grey 1px solid',
        flexDirection: 'row',
        height: '100%',
        top: 0,
        right: 0,
      }}
    >
      {viewer &&
        <OperationsGroup
          unSelectItem={unSelectItem}
        />
      }
      <Box
        sx={{
          display: isDrawerOpen ? 'flex' : 'none',
          width: isMobile ? '100vw' : sidebarWidth,
          height: '100%',
          flexDirection: 'row',
          overflowY: 'auto',
          backgroundColor: colorTheme.isDay() ? dayColor : nightColor,
          borderLeft: 'grey 1px solid',
          color: colorTheme.isDay() ? 'black' : 'lightGrey',
        }}
        ref={sidebarRef}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Box
          sx={{
            flexGrow: 0,
            flexShrink: 0,
            flexBasis: '8px',
            justifySelf: 'flex-start',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'col-resize',
            resize: 'horizontal',
          }}
        >
          <Box
            sx={{
              width: '100%',
              height: '30px',
              backgroundColor: '#c1c3c5b4',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onMouseDown={startResizing}
          >
            {Array.from({length: 3}).map((v, i) =>
              <Box
                key={i}
                sx={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '2px',
                  backgroundColor: 'white',
                }}
              />,
            )}
          </Box>
        </Box>
        <Box sx={{
          flexDirection: 'column',
          flex: 1,
        }}
        >
          <Box sx={{
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
              borderBottom: `${theme.palette.highlight.heaviest} 1px solid`,
              padding: '0 .5em',
            }}
          >
            {isCommentsOn && <NotesPanel/>}
          </Box>
          <Box
            sx={{
              display: isPropertiesOn ? 'block' : 'none',
              padding: '0 .5em',
            }}
          >
            {isPropertiesOn && <PropertiesPanel/>}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

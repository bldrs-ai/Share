import React, {useEffect, ReactElement} from 'react'
import {Stack} from '@mui/material'
import useStore from '../store/useStore'
import NotesAndPropertiesDrawer from './NotesAndPropertiesDrawer'
import AppsSideDrawer from './AppsSideDrawer'


/**
 * Right side drawer component, houses Notes and Apps panels.
 *
 * @return {ReactElement}
 */
export default function RightSideDrawers() {
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const isAppsVisible = useStore((state) => state.isAppsVisible)

  const rightDrawerWidth = useStore((state) => state.rightDrawerWidth)
  const rightDrawerWidthInitial = useStore((state) => state.rightDrawerWidthInitial)
  const setRightDrawerWidth = useStore((state) => state.setRightDrawerWidth)

  const appsDrawerWidth = useStore((state) => state.appsDrawerWidth)
  const appsDrawerWidthInitial = useStore((state) => state.appsDrawerWidthInitial)
  const setAppsDrawerWidth = useStore((state) => state.setAppsDrawerWidth)

  // Wrapper functions for setting widths that enforce the max total width.
  const handleSetRightDrawerWidth = (newWidth, isExpanding = undefined) => {
    if (isExpanding !== void 0) {
      if (isExpanding) {
        // consider this full screen mode for notes, minimize apps drawer if it is open
        if (isAppsVisible) {
          setAppsDrawerWidth(10)
        }

        const clampedWidth = Math.min(newWidth, availableWidth - 10)
        setRightDrawerWidth(clampedWidth)
        return
      } else {
        // exiting full screen mode, restore default widths
        setRightDrawerWidth(rightDrawerWidthInitial)
        setAppsDrawerWidth(appsDrawerWidthInitial)
        return
      }
    }

    const clampedWidth = Math.min(newWidth, availableWidth - appsDrawerWidth)
    setRightDrawerWidth(clampedWidth)
  }

  const handleSetAppsDrawerWidth = (newWidth, isExpanding = undefined) => {
    if (isExpanding !== void 0) {
      if (isExpanding) {
        // consider this full screen mode for apps, minimize notes drawer if it is open
        if (isNotesVisible) {
          setRightDrawerWidth(10)
        }
        const clampedWidth = Math.min(newWidth, availableWidth - 10)
        setAppsDrawerWidth(clampedWidth)
        return
      } else {
        // exiting full screen mode, restore default widths
        setAppsDrawerWidth(appsDrawerWidthInitial)
        setRightDrawerWidth(rightDrawerWidthInitial)
        return
      }
    }

    const clampedWidth = Math.min(newWidth, availableWidth - rightDrawerWidth)
    setAppsDrawerWidth(clampedWidth)
  }

  useEffect(() => {
    if (isAppsVisible) {
      setAppsDrawerWidth(appsDrawerWidthInitial)
    }
    if (isNotesVisible) {
      setRightDrawerWidth(rightDrawerWidthInitial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotesVisible])

  useEffect(() => {
    if (isNotesVisible) {
      setRightDrawerWidth(rightDrawerWidthInitial)
    }

    if (isAppsVisible) {
      setAppsDrawerWidth(appsDrawerWidthInitial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAppsVisible])

  // Hardcoded width for now
  const availableWidth = 2000

  return (
    <Stack direction='row' sx={{flexShrink: 0, overflow: 'hidden'}}>
      <NotesAndPropertiesDrawer
        setDrawerWidth={handleSetRightDrawerWidth}
      />
      <AppsSideDrawer
        setDrawerWidth={handleSetAppsDrawerWidth}
      />
    </Stack>
  )
}

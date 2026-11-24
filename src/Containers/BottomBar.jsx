import React, {ReactElement} from 'react'
import {Box, Stack} from '@mui/material'
import AboutControl from '../Components/About/AboutControl'
import BotControl from '../Components/Bot/BotControl'
import ElementsControl from '../Components/ElementsControl'
import HelpControl from '../Components/Help/HelpControl'
import LoadReportControl from '../Components/LoadReport/LoadReportControl'
import useExistInFeature from '../hooks/useExistInFeature'


/**
 * BottomBar contains AboutControl, ElementsControl, BotChat and HelpControl
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function BottomBar({deselectItems}) {
  const isBotEnabled = useExistInFeature('assist')
  // With the workspace shell on, the ProjectsDrawer footer carries the
  // only logo (LogoMenu) — including the version tooltip and the About
  // dialog — so this over-canvas copy would be a second brand mark.
  const isWorkspaceEnabled = useExistInFeature('workspace')
  return (
    <Stack
      spacing={2}
      direction='row'
      justifyContent='space-between'
      alignItems='center'
      data-testid='BottomBar'
      sx={{position: 'relative'}}
    >
      {isWorkspaceEnabled ? <Box/> : <AboutControl/>}
      <ElementsControl deselectItems={deselectItems}/>
      {/*
        Live load progress renders in the snackbar (AlertDialogAndSnackbar).
        LoadReportControl (the "i" next to "?") shows only once a load has
        finished with a report — see conway #301 follow-up. The perf panel
        that used to sit here is in the debug dock now (DebugDock.jsx).
      */}
      <Stack direction='row' alignItems='center' spacing={2}>
        <LoadReportControl/>
        {isBotEnabled ? <BotControl/> : <HelpControl/>}
      </Stack>
    </Stack>
  )
}

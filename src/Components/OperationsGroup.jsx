import React, {ReactElement} from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import CameraControl from './Camera/CameraControl'
import MarkerControl from '../Components/Markers/MarkerControl'
import ImagineControl from './Imagine/ImagineControl'
import NotesControl from './Notes/NotesControl'
import ProfileControl from './Profile/ProfileControl'
import PropertiesControl from './Properties/PropertiesControl'
import ShareControl from './Share/ShareControl'
import AppsIcon from '@mui/icons-material/Apps'


/**
 * OperationsGroup contains tools for profile, sharing, notes, properties and
 * imagine
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function OperationsGroup({deselectItems}) {
  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const isAppsOpen = useStore((state) => state.isAppsOpen)
  const isImagineEnabled = useStore((state) => state.isImagineEnabled)
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isPropertiesEnabled = useStore((state) => state.isPropertiesEnabled)
  const isShareEnabled = useStore((state) => state.isShareEnabled)
  const selectedElement = useStore((state) => state.selectedElement)
  const toggleAppsDrawer = useStore((state) => state.toggleAppsDrawer)
  const isAnElementSelected = selectedElement !== null

  // required for MarkerControl
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)
  const model = useStore((state) => state.model)

  return (
    <Stack alignItems='flex-end'>
      <Stack direction='row' spacing={1} sx={{border: 'solid 1px blue', '& >': 'border: solid 3px red'}}>
        <>
          {isLoginEnabled && <ProfileControl/>}
          {isLoginEnabled && <ProfileControl/>}
          {isAppsEnabled &&
           <TooltipIconButton
             title='Open Apps'
             icon={<AppsIcon className="icon-share"/>}
             selected={isAppsOpen}
             onClick={() => toggleAppsDrawer()}
             placement='left'
           />}
          <Box sx={{width: '50px', height: '50px', border: 'solid 1px green'}}/>
          <Box sx={{width: '50px', height: '50px', border: 'solid 1px green'}}/>
        </>
      </Stack>
      {/* This lines up divider with top of notes content panel */}
      <Divider/>
      {isShareEnabled && <ShareControl/>}
      {isNotesEnabled && <NotesControl/>}
      {isPropertiesEnabled && isAnElementSelected && <PropertiesControl/>}
      {(viewer && isModelReady) && (
        <MarkerControl
        context={viewer.context ? viewer.context : null}
        oppositeObjects={[model ? model : null]}
        postProcessor={viewer ? viewer.postProcessor : null}
        data-testid='markerControl'
        />
      )}
      {isImagineEnabled && <ImagineControl/>}
      {/* Invisible */}
      <CameraControl/>
    </Stack>
  )
}

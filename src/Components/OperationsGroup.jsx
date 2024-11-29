import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import useStore from '../store/useStore'
import AppsControl from './Apps/AppsControl'
import CameraControl from './Camera/CameraControl'
import HelpControl from '../Components/Help/HelpControl'
import MarkerControl from '../Components/Markers/MarkerControl'
import ImagineControl from './Imagine/ImagineControl'
import NotesControl from './Notes/NotesControl'
import ProfileControl from './Profile/ProfileControl'
import PropertiesControl from './Properties/PropertiesControl'
import ShareControl from './Share/ShareControl'


/**
 * OperationsGroup contains tools for profile, sharing, notes, properties and
 * imagine
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function OperationsGroup({deselectItems}) {
  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const isImagineEnabled = useStore((state) => state.isImagineEnabled)
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isPropertiesEnabled = useStore((state) => state.isPropertiesEnabled)
  const isShareEnabled = useStore((state) => state.isShareEnabled)
  const selectedElement = useStore((state) => state.selectedElement)
  const isAnElementSelected = selectedElement !== null

  // required for MarkerControl
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)
  const model = useStore((state) => state.model)

  return (
    <Stack
      sx={{
        pointerEvents: 'none',
        alignItems: 'flex-end',
      }}
    >
      <Box sx={{pointerEvents: 'auto'}}>
        {isLoginEnabled && <ProfileControl/>}
        {isAppsEnabled && <AppsControl/>}
        {isShareEnabled && <ShareControl/>}
      </Box>
      <Stack sx={{pointerEvents: 'auto', height: '100%'}}>
        <Divider/>
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
        <Box sx={{marginTop: 'auto'}}><HelpControl/></Box>
      </Stack>
    </Stack>
  )
}

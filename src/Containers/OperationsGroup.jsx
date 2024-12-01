import React, {ReactElement} from 'react'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import AppsControl from '../Components/Apps/AppsControl'
import CameraControl from '../Components/Camera/CameraControl'
import MarkerControl from '../Components/Markers/MarkerControl'
import ImagineControl from '../Components/Imagine/ImagineControl'
import NotesControl from '../Components/Notes/NotesControl'
import ProfileControl from '../Components/Profile/ProfileControl'
import PropertiesControl from '../Components/Properties/PropertiesControl'
import ShareControl from '../Components/Share/ShareControl'
import useStore from '../store/useStore'


/**
 * OperationsGroup contains tools for profile, sharing, notes, properties and
 * imagine
 *
 * @return {ReactElement}
 */
export default function OperationsGroup() {
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
      <Stack direction='row' sx={{pointerEvents: 'auto'}}>
        {isLoginEnabled && <ProfileControl/>}
        {isAppsEnabled && <AppsControl/>}
        {isShareEnabled && <ShareControl/>}
      </Stack>
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
      </Stack>
    </Stack>
  )
}

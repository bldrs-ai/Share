import React, {ReactElement} from 'react'
import {Stack} from '@mui/material'
import AppsControl from '../Components/Apps/AppsControl'
import HelpControl from '../Components/Help/HelpControl'
import ImagineControl from '../Components/Imagine/ImagineControl'
import NotesControl from '../Components/Notes/NotesControl'
import ProfileControl from '../Components/Profile/ProfileControl'
import PropertiesControl from '../Components/Properties/PropertiesControl'
import ShareControl from '../Components/Share/ShareControl'
import useStore from '../store/useStore'


/**
 * Top-right toolbar: profile, apps, share, help, and context-sensitive controls.
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
        <HelpControl/>
      </Stack>
      <Stack sx={{pointerEvents: 'auto'}}>
        {isNotesEnabled && <NotesControl/>}
        {isPropertiesEnabled && isAnElementSelected && <PropertiesControl/>}
        {isImagineEnabled && <ImagineControl/>}
      </Stack>
    </Stack>
  )
}

import React, {ReactElement} from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import Divider from '@mui/material/Divider'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import CameraControl from './Camera/CameraControl'
import MarkerControl from '../Components/Markers/MarkerControl'
import ImagineControl from './Imagine/ImagineControl'
import NotesControl from './Notes/NotesControl'
import ProfileControl from './Profile/ProfileControl'
import PropertiesControl from './Properties/PropertiesControl'
import ShareControl from './Share/ShareControl'
import AppStoreIcon from '../assets/icons/AppStore.svg'


/**
 * OperationsGroup contains tools for profile, sharing, notes, properties and
 * imagine
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function OperationsGroup({deselectItems}) {
  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const isAppStoreOpen = useStore((state) => state.isAppStoreOpen)
  const isImagineEnabled = useStore((state) => state.isImagineEnabled)
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isPropertiesEnabled = useStore((state) => state.isPropertiesEnabled)
  const isShareEnabled = useStore((state) => state.isShareEnabled)
  const selectedElement = useStore((state) => state.selectedElement)
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)
  const isAnElementSelected = selectedElement !== null

  // required for MarkerControl
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)
  const model = useStore((state) => state.model)

  return (
    <ButtonGroup orientation='vertical' variant='controls'>
      {isLoginEnabled && (
        <>
          <ProfileControl/>
          {/* This lines up divider with top of notes content panel */}
          <Divider/>
        </>)}
      {isShareEnabled && <ShareControl/>}
      {isNotesEnabled && <NotesControl/>}
      {isPropertiesEnabled && isAnElementSelected && <PropertiesControl/>}
      {isAppsEnabled &&
       <TooltipIconButton
         title='Open App Store'
         icon={<AppStoreIcon/>}
         selected={isAppStoreOpen}
         onClick={() => toggleAppStoreDrawer()}
         placement='left'
       />
      }
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
    </ButtonGroup>
  )
}

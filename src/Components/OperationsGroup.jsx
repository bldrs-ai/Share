import React from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import Divider from '@mui/material/Divider'
import AppStoreIcon from '../assets/icons/AppStore.svg'
import {useExistInFeature} from '../hooks/useExistInFeature'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import CameraControl from './CameraControl'
import ImagineControl from './ImagineControl'
import NotesControl from './Notes/NotesControl'
import PersonaControl from './Persona/PersonaControl'
import PropertiesControl from './Properties/PropertiesControl'
import ShareControl from './ShareControl'


/**
 * OperationsGroup contains tools for persona, sharing, notes, properties and
 * imagine
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.ReactElement}
 */
export default function OperationsGroup({deselectItems}) {
  const isAppStoreEnabled = useExistInFeature('apps')
  const isAppStoreOpen = useStore((state) => state.isAppStoreOpen)
  const isImagineEnabled = useStore((state) => state.isImagineEnabled)
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isPropertiesEnabled = useStore((state) => state.isPropertiesEnabled)
  const isShareEnabled = useStore((state) => state.isShareEnabled)
  const selectedElement = useStore((state) => state.selectedElement)
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)
  const isAnElementSelected = selectedElement !== null

  return (
    <ButtonGroup orientation='vertical' variant='controls'>
      {isLoginEnabled && (
        <>
          <PersonaControl/>
          {/* This lines up divider with top of notes content panel */}
          <Divider sx={{margin: '8px 0'}}/>
        </>)}
      {isShareEnabled && <ShareControl/>}
      {isNotesEnabled && <NotesControl/>}
      {isPropertiesEnabled && isAnElementSelected && <PropertiesControl/>}
      {isAppStoreEnabled &&
       <TooltipIconButton
         title='Open App Store'
         icon={<AppStoreIcon/>}
         selected={isAppStoreOpen}
         onClick={() => toggleAppStoreDrawer()}
       />
      }
      {isImagineEnabled && <ImagineControl/>}
      {/* Invisible */}
      <CameraControl/>
    </ButtonGroup>
  )
}

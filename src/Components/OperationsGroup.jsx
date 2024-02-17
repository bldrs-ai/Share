import React from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import useStore from '../store/useStore'
import CameraControl from './CameraControl'
import NotesControl from './Notes/NotesControl'
import PropertiesControl from './Properties/PropertiesControl'
import ShareControl from './ShareControl'
import ImagineControl from './ImagineControl'
import {TooltipIconButton} from './Buttons'
import AppStoreIcon from '../assets/icons/AppStore.svg'
import {useExistInFeature} from '../hooks/useExistInFeature'


/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.ReactElement}
 */
export default function OperationsGroup({deselectItems}) {
  const isAppStoreEnabled = useExistInFeature('apps')
  const isAppStoreOpen = useStore((state) => state.isAppStoreOpen)
  const isImagineEnabled = useStore((state) => state.isImagineEnabled)
  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isPropertiesEnabled = useStore((state) => state.isPropertiesEnabled)
  const isShareEnabled = useStore((state) => state.isShareEnabled)
  const selectedElement = useStore((state) => state.selectedElement)
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)
  const isAnElementSelected = selectedElement !== null

  return (
    <ButtonGroup
      orientation='vertical'
      variant='contained'
      sx={{'margin': '1em', '& > *:not(:last-child)': {margin: '0.2em 0'}}}
    >
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

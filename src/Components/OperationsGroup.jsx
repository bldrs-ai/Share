import React from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import Divider from '@mui/material/Divider'
import useStore from '../store/useStore'
import CameraControl from './CameraControl'
import LoginMenu from './LoginMenu'
import NotesControl from './Notes/NotesContol'
import ShareControl from './ShareControl'
import ImagineControl from './ImagineControl'
import {TooltipIconButton} from './Buttons'
import AppStoreIcon from '../assets/icons/AppStore.svg'
import {useExistInFeature} from '../hooks/useExistInFeature'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'


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
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isPropertiesVisible = useStore((state) => state.isPropertiesVisible)
  const isShareEnabled = useStore((state) => state.isShareEnabled)
  const selectedElement = useStore((state) => state.selectedElement)
  const setIsSideDrawerVisible = useStore((state) => state.setIsSideDrawerVisible)
  const toggleAppStoreDrawer = useStore((state) => state.toggleAppStoreDrawer)
  const toggleIsPropertiesVisible = useStore((state) => state.toggleIsPropertiesVisible)
  const isSelected = () => {
    const ifSelected = (
      selectedElement !== null
    )
    return ifSelected
  }

  return (
    <ButtonGroup
      orientation='vertical'
      variant='contained'
      sx={{'margin': '1em', '& > *:not(:last-child)': {margin: '0.2em 0'}}}
    >
      {isLoginEnabled && (<><LoginMenu/><Divider/></>)}
      {isShareEnabled && <ShareControl/>}
      {isNotesEnabled && <NotesControl/>}
      {isSelected() && selectedElement !== null &&
       <TooltipIconButton
         title='Properties'
         onClick={() => {
           toggleIsPropertiesVisible()
           setIsSideDrawerVisible(true)
         }}
         selected={isPropertiesVisible}
         icon={<FormatListBulletedIcon className='icon-share'/>}
       />
      }

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

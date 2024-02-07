import React from 'react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import Properties from '../Properties/Properties'
import useStore from '../../store/useStore'
import {hexToRgba} from '../../utils/color'
import Notes from '../Notes/Notes'
import NotesNavBar from '../Notes/NotesNavBar'
import {CloseButton} from '../Buttons'
import {useIsMobile} from '../Hooks'
import NoContent from '../NoContent'
import PanelTitle from '../PanelTitle'


/**
 * @param {object} props React props with children
 * @return {React.ReactElement}
 */
export function PanelWithTitle(props) {
  const titleHeight = '2.8em'
  const paddingBottom = '0.6em'
  const theme = useTheme()
  // This isn't visible, but the alignment is important for debugging, so leaving.
  const headerBorderOpacity = 0
  const headerBorderColor = hexToRgba(theme.palette.primary.contrastText, headerBorderOpacity)
  const isMobile = useIsMobile()

  return (
    <Box sx={{height: '100%', overflow: 'hidden'}}>
      <Box
        sx={{
          height: props.includeGutter ? `calc(${titleHeight} + ${paddingBottom})` : '${titleHeight}',
          borderBottom: `solid 1px ${headerBorderColor}`,
        }}
      >
        <PanelTitle title={props.title} iconSrc={props.iconSrc} controlsGroup={props.controlsGroup}/>
      </Box>
      <Box
        sx={{
          height: `calc(100% - ${titleHeight})`,
          overflow: 'auto',
          padding: isMobile ? '0 0.5em 0 0' : '0em 0.5em 1em 0',
        }}
      >
        {props.children}
      </Box>
    </Box>
  )
}


/** @return {React.ReactElement} */
export function NotesPanel() {
  const isCreateNoteActive = useStore((state) => state.isCreateNoteActive)
  const selectedNoteId = useStore((state) => state.selectedNoteId)

  let title = selectedNoteId ? 'NOTE' : 'NOTES'
  if (isCreateNoteActive) {
    title = 'ADD A NOTE'
  }

  return (
    <PanelWithTitle title={title} controlsGroup={<NotesNavBar/>} includeGutter={true}>
      <Notes/>
    </PanelWithTitle>
  )
}


/**
 * PropertiesPanel is a wrapper for the item properties component.  It
 * contains the title with additional controls, and the item
 * properties styled container
 *
 * @property {boolean} Include gutter Should be present only when
 *     Properties occupies full SideDrawer.
 * @return {React.ReactElement} Properties Panel react component
 */
export function PropertiesPanel({includeGutter}) {
  const selectedElement = useStore((state) => state.selectedElement)
  const toggleIsPropertiesVisible = useStore((state) => state.toggleIsPropertiesVisible)
  return (
    <PanelWithTitle title={'PROPERTIES'}
      controlsGroup={
        <CloseButton
          onClick={toggleIsPropertiesVisible}
        />
      }
      includeGutter={includeGutter}
    >
      {selectedElement ?
        <Properties/> :
        <NoContent message={'Please select an element to access properties.'}/>
      }
    </PanelWithTitle>
  )
}

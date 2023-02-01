import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import useStore from '../../store/useStore'
import {hexToRgba} from '../../utils/color'
import ItemProperties from '../ItemProperties/ItemProperties'
import Notes from '../Notes/Notes'
import NotesNavBar from '../Notes/NotesNavBar'
import PanelTitle from '../PanelTitle'


/**
 * @param {object} props React props with children
 * @return {React.Component}
 */
function PanelWithTitle(props) {
  const titleHeight = '3em'
  const paddingBottom = '0.6em'
  const theme = useTheme()
  // This isn't visible, but the alignment is important for debugging, so leaving.
  const headerBorderOpacity = 0
  const headerBorderColor = hexToRgba(theme.palette.primary.contrastText, headerBorderOpacity)
  return (
    <Box sx={{height: '100%', overflow: 'hidden'}}>
      <Box
        sx={{
          height: props.includeGutter ? `calc(${titleHeight} + ${paddingBottom})` : '${titleHeight}',
          borderBottom: `solid 1px ${headerBorderColor}`,
        }}
      >
        <PanelTitle title={props.title} controlsGroup={props.controlsGroup}/>
      </Box>
      <Box
        sx={{
          height: `calc(100% - ${titleHeight})`,
          overflow: 'auto',
          padding: '1em 0.5em 1em 0',
        }}
      >
        {props.children}
      </Box>
    </Box>
  )
}


/** @return {React.Component} */
export function NotesPanel() {
  // TODO(pablo): const selectedNoteId = useStore((state) => state.selectedNoteId)
  return (
    <PanelWithTitle title={'Notes'} controlsGroup={<NotesNavBar/>} includeGutter={true}>
      <Notes/>
    </PanelWithTitle>
  )
}


/**
 * PropertiesPanel is a wrapper for the item properties component.
 * It contains the title with additional controls, and the item properties styled container.
 *
 * @property {boolean} Include gutter.  Should be present only when
 *     Properties occupies full SideDrawer.
 * @return {React.Component} Properties Panel react component
 */
export function PropertiesPanel({includeGutter}) {
  const selectedElement = useStore((state) => state.selectedElement)
  return (
    <PanelWithTitle title={'Properties'} includeGutter={includeGutter}>
      {selectedElement ?
       <ItemProperties/> :
       <Typography variant='p'>Please select an element</Typography>
      }
    </PanelWithTitle>
  )
}

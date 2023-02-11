import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Dialog from './Dialog'
import {useIsMobile} from './Hooks'
import {ControlButton} from './Buttons'
import KnowledgeIcon from '../assets/icons/Knowledge.svg'


/**
 * Displays keyboard shortcuts like how to add a cut plane.
 *
 * @return {object} React component
 */
export default function ShortcutsControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)


  return (
    <ControlButton
      title='Guides'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      icon={
        <Box sx={{
          width: '20px',
          height: '20px',
          marginBottom: '4px',
        }}
        >
          <KnowledgeIcon/>
        </Box>
      }
      dialog={
        <ShortcutsDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
        />
      }
    />)
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function ShortcutsDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const isMobile = useIsMobile()


  return (
    <Dialog
      icon={<KnowledgeIcon/>}
      headerText='Guides'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={
        isMobile ?
          (
            <>
              <Typography variant='h2'>Guide</Typography>
              <Box component='p'>To select an element:</Box>
              <Box component='ul'>
                <Box component='li'>Double tap an element</Box>
                <Box component='li'>X is used to clear the selection</Box>
              </Box>
              <Box component='p'>To attach a cut plane:</Box>
              <Box component='ul'>
                <Box component='li'>Tap a model element</Box>
                <Box component='li'>Tap a section plane button</Box>
                <Box component='li'>Attach multiple planes</Box>
                <Box component='li'>X is used to clear the planes</Box>
              </Box>
            </>
          ) :
          (
            <Box sx={{
              textAlign: 'left',
            }}
            >
              <Box component='p'>To attach a section plane:</Box>
              <Box component='li'>Hover over an element</Box>
              <Box component='li'>Press <strong>Q to attach a section plane</strong></Box>
              <Box component='li'>Hover over a plane press <strong>W to delete the plane</strong></Box>
              <Box component='li'>Multiple planes can be attached to a model</Box>
              <Box component='p'>To clear selection:</Box>
              <Box component='li'>Press <strong>A to clear selected element</strong></Box>
            </Box>
          )
      }
    />
  )
}

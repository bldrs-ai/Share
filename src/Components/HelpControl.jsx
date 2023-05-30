import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import Dialog from './Dialog'
import {TooltipIconButton} from './Buttons'
import InstructionsIcon from '../assets/icons/Instructions.svg'
import QuestionIcon from '../assets/icons/Question.svg'
import ShareIcon from '../assets/icons/Share.svg'
import NotesIcon from '../assets/icons/Notes.svg'
import CutPlaneIcon from '../assets/icons/CutPlane.svg'
import ViewIcon from '../assets/icons/View.svg'
import TreeIcon from '../assets/icons/Tree.svg'
import RenderingIcon from '../assets/icons/RenderingBold.svg'


/**
 * Displays model open dialog.
 *
 * @return {React.ReactElement}
 */
export default function HelpControl({fileOpen, modelPath, isLocalModel}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)

  return (
    <Box>
      <TooltipIconButton
        title={'Help'}
        onClick={() => setIsDialogDisplayed(true)}
        icon={<QuestionIcon/>}
        placement={'left'}
        selected={isDialogDisplayed}
        dataTestId='open-ifc'
      />
      {isDialogDisplayed &&
        <HelpDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
        />
      }
    </Box>
  )
}

const HelpComponent = ({icon, description}) => {
  const theme = useTheme()
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '250px',
        marginBottom: '10px',
        paddingBottom: '4px',
        borderBottom: `1px solid ${theme.palette.background.button}`,
      }}
    >
      <Box
        sx={{
          marginLeft: '10px',
        }}
      >
        {icon}
      </Box>
      <Typography variant='h5'
        sx={{
          width: '200px',
          textAlign: 'left',
        }}
      >
        {description}
      </Typography>
    </Box>
  )
}

/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function HelpDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  /**
   * Close About dialog and redirect to Share instruction note
   */
  function redirectToShareNote() {
    window.location.replace('https://bldrs.ai/share/v/p/index.ifc#c:-113.444,0.464,81.43,-23.595,24.522,10.88::i:1493510953')
    setIsDialogDisplayed(false)
  }


  return (
    <Dialog
      icon={<QuestionIcon/>}
      headerText={'Help'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'Share Instruction'}
      actionIcon={<InstructionsIcon/>}
      actionCb={redirectToShareNote}
      content={
        <Box
          sx={{
            width: '260px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <HelpComponent
            icon={<ShareIcon/>}
            description={'Share sectioned portions of the project'}
          />
          <HelpComponent
            icon={<NotesIcon/>}
            description={'Attach text snippets to 3D elements'}
          />
          <HelpComponent
            icon={<CutPlaneIcon/>}
            description={'Attach multiple sections to isolate portions of the project'}
          />
          <HelpComponent
            icon={<ViewIcon/>}
            description={'Study the project using standard views'}
          />
          <HelpComponent
            icon={<TreeIcon/>}
            description={'Navigate the project using element hierarchies'}
          />
          <HelpComponent
            icon={<RenderingIcon/>}
            description={'Generate renderings of the project using text prompts'}
          />
          <Box>
            <Box sx={{width: '10px', height: '10px'}}/>
          </Box>
        </Box>
      }
    />
  )
}

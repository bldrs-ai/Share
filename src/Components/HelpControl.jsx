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
import ViewIcon from '../assets/icons/View.svg'
import TreeIcon from '../assets/icons/Tree.svg'
import RobotIcon from '../assets/icons/Robot3.svg'
import BulletIcon from '../assets/icons/Bullet.svg'
import ShortcutIcon from '../assets/icons/Shortcut.svg'


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
        showTitle={true}
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

const HelpList = () => {
  return (
    <Box
      sx={{
        marginLeft: '10px',
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
        icon={<ViewIcon/>}
        description={'Study the project using standard views and sections'}
      />
      <HelpComponent
        icon={<TreeIcon/>}
        description={'Navigate the project using element hierarchies'}
      />
      <HelpComponent
        icon={<RobotIcon/>}
        description={'Generate renderings of the project using text prompts'}
      />
    </Box>
  )
}

const ShortCutList = () => {
  return (
    <Box
      sx={{
        marginLeft: '10px',
      }}
    >
      <HelpComponent
        icon={<BulletIcon/>}
        description={'To attach a plane to any surface, hover over a surface and press Q'}
      />
      <HelpComponent
        icon={<BulletIcon/>}
        description={'To delete a plane, hover over a plane and press W'}
      />
      <HelpComponent
        icon={<BulletIcon/>}
        description={'To isolate any element select the element and press I'}
      />
      <HelpComponent
        icon={<BulletIcon/>}
        description={'To hide any element select the element and press H'}
      />
      <HelpComponent
        icon={<BulletIcon/>}
        description={'To unhide any element select the element and press U'}
      />
      <HelpComponent
        icon={<BulletIcon/>}
        description={'To revel all hidden elements press R'}
      />
    </Box>
  )
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function HelpDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const theme = useTheme()
  const [info, setInfo] = useState(true)
  /**
   * Close About dialog and redirect to Share instruction note
   */
  function redirectToShareNote() {
    window.location.replace('https://bldrs.ai/share/v/p/index.ifc#c:-113.444,0.464,81.43,-23.595,24.522,10.88::i:1493510953')
    setIsDialogDisplayed(false)
  }


  return (
    <Dialog
      icon={info ? <QuestionIcon/> : <ShortcutIcon/>}
      headerText={info ? 'Help' : 'Shortcuts'}
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
          {info && <HelpList/>}
          {!info && <ShortCutList/>}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              width: '26px',
              marginTop: '6px',
            }}
          >
            <Box
              onClick={() => setInfo(true)}
              sx={{
                width: '10px',
                height: '10px',
                cursor: 'pointer',
                backgroundColor: `${info ? theme.palette.secondary.background : theme.palette.secondary.main}`,
                borderRadius: '2px'}}
            />
            <Box
              onClick={() => setInfo(false)}
              sx={{
                width: '10px',
                height: '10px',
                cursor: 'pointer',
                backgroundColor: `${info ? theme.palette.secondary.main : theme.palette.secondary.background}`,
                borderRadius: '2px'}}
            />
          </Box>
        </Box>
      }
    />
  )
}

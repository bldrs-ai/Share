import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import Dialog from './Dialog'
import {TooltipIconButton} from './Buttons'
import TreeIcon from '../assets/icons/Tree.svg'
import ShareIcon from '../assets/icons/Share.svg'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import CropOutlinedIcon from '@mui/icons-material/CropOutlined'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'


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
        icon={<HelpOutlineIcon/>}
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
      <Typography variant='body1'
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
        icon={<ShareIcon className='icon-share'/>}
        description={'Share sectioned portions of the project'}
      />
      <HelpComponent
        icon={<ChatOutlinedIcon/>}
        description={'Attach notes to 3D elements'}
      />
      <HelpComponent
        icon={<CropOutlinedIcon/>}
        description={'Study the project using standard sections'}
      />
      <HelpComponent
        icon={<TreeIcon className='icon-share'/>}
        description={'Navigate the project using element hierarchies'}
      />
      <HelpComponent
        icon={<AutoFixHighIcon/>}
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
        icon={<div style={{fontWeight: 500}}> Q </div>}
        description={'To attach a plane to any surface, hover over a surface and press Q'}
      />
      <HelpComponent
        icon={<div style={{fontWeight: 500}}> I </div>}
        description={'To isolate any element select the element and press I'}
      />
      <HelpComponent
        icon={<div style={{fontWeight: 500}}> H </div>}
        description={'To hide any element select the element and press H'}
      />
      <HelpComponent
        icon={<div style={{fontWeight: 500}}> U </div>}
        description={'To unhide any element select the element and press U'}
      />
      <HelpComponent
        icon={<div style={{fontWeight: 500}}> R </div>}
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


  return (
    <Dialog
      icon={<HelpOutlineIcon/>}
      headerText={info ? 'Help' : 'Shortcuts'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'OK'}
      actionIcon={<HelpOutlineIcon/>}
      actionCb={() => setIsDialogDisplayed(false)}
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
                backgroundColor: `${info ? theme.palette.secondary.main : theme.palette.secondary.background}`,
                borderRadius: '2px'}}
            />
            <Box
              onClick={() => setInfo(false)}
              sx={{
                width: '10px',
                height: '10px',
                cursor: 'pointer',
                backgroundColor: `${info ? theme.palette.secondary.background : theme.palette.secondary.main}`,
                borderRadius: '2px'}}
            />
          </Box>
        </Box>
      }
    />
  )
}

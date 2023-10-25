import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import Dialog from './Dialog'
import {TooltipIconButton} from './Buttons'
import CropOutlinedIcon from '@mui/icons-material/CropOutlined'
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import FormatListBulletedOutlinedIcon from '@mui/icons-material/FormatListBulletedOutlined'
import HistoryIcon from '@mui/icons-material/History'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined'
import TreeIcon from '../assets/icons/Tree.svg'
import ShareIcon from '../assets/icons/Share.svg'
import LogoB from '../assets/LogoB.svg'


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
        title={'Information'}
        onClick={() => setIsDialogDisplayed(true)}
        icon={<InfoOutlinedIcon color='secondary'/>}
        placement={'left'}
        selected={isDialogDisplayed}
        dataTestId='open-ifc'
        showTitle={true}
        variant='rounded'
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
        justifyContent: 'flex-start',
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
      <Typography variant='overline'
        sx={{
          marginLeft: '30px',
          width: '180px',
          textAlign: 'left',
          lineHeight: '1.2em',
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
        icon={
          <Box
            sx={{
              '& svg': {
                'marginTop': '6px',
                'marginLeft': '3px',
                'width': '20px',
                '@media (max-width: 900px)': {
                  marginTop: '4px',
                  width: '20px',
                },
              },
            }}
          >
            <LogoB/>
          </Box>}
        description={'Show / Hide Bldrs tools'}
      />
      <HelpComponent
        icon={<TouchAppOutlinedIcon className='icon-share' color='secondary'/>}
        description={'Double click/tap the model to select an element'}
      />
      <HelpComponent
        icon={<CreateNewFolderOutlinedIcon color='secondary'/>}
        description={'Open IFC projects from GITHUB or local drive'}
      />
      <HelpComponent
        icon={<ShareIcon className='icon-share' color='secondary' style={{marginRight: '2px'}}/>}
        description={'Share sectioned portions of the project'}
      />
      <HelpComponent
        icon={<TreeIcon className='icon-share' color='secondary' style={{marginRight: '2px'}}/>}
        description={'Navigate the project using element hierarchies'}
      />
      <HelpComponent
        icon={<ChatOutlinedIcon color='secondary'/>}
        description={'Attach notes to 3D elements'}
      />
      <HelpComponent
        icon={<FormatListBulletedOutlinedIcon className='icon-share' color='secondary'/>}
        description={'Study element properties'}
      />
      <HelpComponent
        icon={<HistoryIcon color='secondary'/>}
        description={'Access project version history'}
      />
      <HelpComponent
        icon={<CropOutlinedIcon color='secondary'/>}
        description={'Study the project using standard sections'}
      />
    </Box>
  )
}

// const ShortCutList = () => {
//   return (
//     <Box
//       sx={{
//         marginLeft: '10px',
//       }}
//     >
//       <HelpComponent
//         icon={<div style={{fontWeight: 500}}> Q </div>}
//         description={'To attach a plane to any surface, hover over a surface and press Q'}
//       />
//       <HelpComponent
//         icon={<div style={{fontWeight: 500}}> I </div>}
//         description={'To isolate any element select the element and press I'}
//       />
//       <HelpComponent
//         icon={<div style={{fontWeight: 500}}> H </div>}
//         description={'To hide any element select the element and press H'}
//       />
//       <HelpComponent
//         icon={<div style={{fontWeight: 500}}> U </div>}
//         description={'To unhide any element select the element and press U'}
//       />
//       <HelpComponent
//         icon={<div style={{fontWeight: 500}}> R </div>}
//         description={'To revel all hidden elements press R'}
//       />
//     </Box>
//   )
// }


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function HelpDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  // const theme = useTheme()
  // const [info, setInfo] = useState(true)


  return (
    <Dialog
      icon={<InfoOutlinedIcon/>}
      headerText={'Bldrs.AI'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'OK'}
      actionIcon={<InfoOutlinedIcon/>}
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
          <HelpList/>
          {/* <Box
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
          </Box> */}
        </Box>
      }
    />
  )
}

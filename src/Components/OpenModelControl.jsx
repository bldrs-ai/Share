import React, {useState, useContext} from 'react'
import {useNavigate} from 'react-router-dom'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import ToggleButton from '@mui/material/ToggleButton'
import TextField from '@mui/material/TextField'
import {makeStyles, useTheme} from '@mui/styles'
import Dialog from './Dialog'
import {TooltipIconButton} from '../Components/Buttons'
import {ColorModeContext} from '../Context/ColorMode'
import ModelsIcon from '../assets/2D_Icons/Model.svg'
import OpenIcon from '../assets/2D_Icons/Open.svg'
import UploadIcon from '../assets/2D_Icons/Upload.svg'


/**
 * Displays open warning.
 *
 * @return {object} React component
 */
export default function OpenModelControl({fileOpen}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const classes = useStyles(useTheme())
  const theme = useContext(ColorModeContext)
  return (
    <div>
      <Paper className={classes.root} elevation={0}
        sx={{backgroundColor: theme.isDay() ? '#E8E8E8' : '#4C4C4C'}}
      >
        <Tooltip title={'Open IFC'} describeChild placement={'top'}>
          <ToggleButton
            selected={isDialogDisplayed}
            onClick={() => setIsDialogDisplayed(true)}
            color='primary'
            value={'something'}
          >
            <OpenIcon/>
          </ToggleButton>
        </Tooltip>
      </Paper>
      {isDialogDisplayed &&
        <OpenModelDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
          fileOpen={fileOpen}
        />
      }
    </div>
  )
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function OpenModelDialog({isDialogDisplayed, setIsDialogDisplayed, fileOpen}) {
  const classes = useStyles()
  const openFile = () => {
    fileOpen()
    setIsDialogDisplayed(false)
  }
  const [selected, setSelected] = React.useState('')
  const navigate = useNavigate()
  const handleSelect = (e) => {
    setSelected(e.target.value)
    const modelPath = {
      0: '/share/v/gh/IFCjs/test-ifc-files/main/Schependomlaan/IFC%20Schependomlaan.ifc#c:60.45,-4.32,60.59,1.17,5.93,-3.77',
      1: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
      2: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
      3: '/share/v/gh/Swiss-Property-AG/Eisvogel-Public/main/EISVOGEL.ifc#c:107.36,8.46,156.67,3.52,2.03,16.71',
      4: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
      // eslint-disable-next-line max-len
      5: '/share/v/gh/sujal23ks/BCF/main/packages/fileimport-service/ifc/ifcs/171210AISC_Sculpture_brep.ifc/120010/120020/120023/4998/2867#c:-163.46,16.12,223.99,12.03,-28.04,-15.28',
    }
    navigate({
      pathname: modelPath[e.target.value],
    })
    setIsDialogDisplayed(false)
  }


  return (
    <Dialog
      icon={<ModelsIcon/>}
      headerText='Open'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={
        <div className={classes.content}>
          <TextField
            className={classes.dropDown}
            value={selected}
            onChange={(e) => handleSelect(e)}
            variant='outlined'
            label='Sample Projects'
            select
            size='small'
          >
            <MenuItem value={1}><Typography variant='p'>Momentum</Typography></MenuItem>
            <MenuItem value={2}><Typography variant='p'>Schneestock</Typography></MenuItem>
            <MenuItem value={3}><Typography variant='p'>Eisvogel</Typography></MenuItem>
            <MenuItem value={4}><Typography variant='p'>Seestrasse</Typography></MenuItem>
            <MenuItem value={0}><Typography variant='p'>Schependomlaan</Typography></MenuItem>
            <MenuItem value={5}><Typography variant='p'>Structural Detail</Typography></MenuItem>
          </TextField>
          <p className={classes.bullet}>
            Models hosted on GitHub are opened by inserting the link to the file into the Search.
            <br/>
            Visit our {' '}
            <span>
              <a
                className={classes.link}
                target="_blank"
                href='https://github.com/bldrs-ai/Share/wiki/Open-IFC-model-hosted-on-GitHub'
                rel="noreferrer"
              >
                wiki
              </a>
            </span> to learn more.
          </p>
          <TooltipIconButton
            title='Open IFC file'
            icon={<UploadIcon/>}
            onClick={openFile}
          />
          <p className={classes.bullet}>
            Models opened from local drive cannot be saved or shared.
          </p>
        </div>
      }
    />
  )
}


const useStyles = makeStyles((theme) => ({
  content: {
    width: '270px',
    marginTop: '6px',
  },
  snippet: {
    textAlign: 'left',
  },
  bullet: {
    textAlign: 'left',
    paddingLeft: '10px',
    paddingRight: '10px',
  },
  link: {
    fontWeight: 'bold',
    color: theme.palette.highlight.secondary,
    cursor: 'pointer',
    borderBottom: `1px solid ${theme.palette.highlight.secondary}`,
  },
  openIcon: {
    textAlign: 'center',
  },
  iconContainer: {
    textTransform: 'Capitalize',
  },
  root: {
    '& button': {
      'width': '44px',
      'height': '44px',
      'border': 'none',
      '&.Mui-selected, &.Mui-selected:hover': {
        backgroundColor: '#97979770',
      },
    },
    '& svg': {
      width: '40px',
      height: '40px',
      fill: theme.palette.primary.contrastText,
    },
  },
  dropDown: {
    'width': '260px',
    '& .MuiOutlinedInput-input': {
      color: theme.palette.highlight.secondary,
    },
    '& .MuiInputLabel-root': {
      color: theme.palette.highlight.secondary,
    },
    '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.highlight.secondary,
    },
    '&:hover .MuiOutlinedInput-input': {
      color: theme.palette.highlight.secondary,
    },
    '&:hover .MuiInputLabel-root': {
      color: theme.palette.highlight.secondary,
    },
    '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.highlight.secondary,
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
      color: theme.palette.highlight.secondary,
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: theme.palette.highlight.secondary,
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.highlight.secondary,
    },
  },
}),
)

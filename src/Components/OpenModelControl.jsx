import React, {useState} from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import {useNavigate} from 'react-router-dom'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import ToggleButton from '@mui/material/ToggleButton'
import TextField from '@mui/material/TextField'
import Dialog from './Dialog'
import ModelsIcon from '../assets/2D_Icons/Model.svg'
import UploadIcon from '../assets/2D_Icons/Upload.svg'
import {TooltipIconButton} from '../Components/Buttons'


/**
 * Displays open warning.
 *
 * @return {object} React component
 */
export default function OpenModelControl({fileOpen}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const classes = useStyles(useTheme())
  return (
    <div>
      <Paper className={classes.root} elevation={1}>
        <Tooltip title={''} describeChild placement={'top'}>
          <ToggleButton
            selected={isDialogDisplayed}
            onClick={() => setIsDialogDisplayed(true)}
            color='primary'
          >
            <Typography variant={'h7'} className={classes.iconContainer}>Open</Typography>
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
      1: '/share/v/gh/OlegMoshkovich/BLDRS_models/main/haus.ifc',
      2: '/share/v/gh/Swiss-Property-AG/Portfolio/main/ASTRA.ifc',
      3: '/share/v/gh/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc',
      4: '/share/v/gh/Swiss-Property-AG/Portfolio/main/KNIK.ifc',
      5: '/share/v/gh/Swiss-Property-AG/Portfolio/main/MOMENTUM%20TINYHOUSE.ifc',
      6: '/share/v/gh/Swiss-Property-AG/Portfolio/main/NIEDERSCHERLI.ifc',
      // eslint-disable-next-line max-len
      7: '/share/v/gh/sujal23ks/BCF/main/packages/fileimport-service/ifc/ifcs/171210AISC_Sculpture_brep.ifc/120010/120020/120023/5007/2907#c:-115.5,-36.4,109.55,0,-41.93,13.88',
      // eslint-disable-next-line max-len
      8: '/share/v/gh/Alhakam/BIMsage/master/BIMsage-Source/BIMsage/src/test/resources/ontology/20200121_Promnitz_Stones.ifc/70/91/116/131/80830#c:-7.58,-3.45,0,0.11,-1.73,-0.32',

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
          <p>
            <TextField
              className={classes.dropDown}
              value={selected}
              onChange={(e) => handleSelect(e)}
              variant='outlined'
              label='Sample Projects'
              select
              size='small'
            >
              <MenuItem value={4}><Typography variant='h2'>Momentum</Typography></MenuItem>
              <MenuItem value={3}><Typography variant='h2'>Eisvogel</Typography></MenuItem>
              <MenuItem value={2}><Typography variant='h2'>Astra</Typography></MenuItem>
              <MenuItem value={7}><Typography variant='h2'>Structural Detail</Typography></MenuItem>
            </TextField>
          </p>
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

          <div>
            <TooltipIconButton
              title='Open IFC file'
              icon={<div style={{padding: '6px 10px 4px 10px', borderRadius: '6px'}}><UploadIcon/></div>}
              onClick={openFile}
            />
          </div>
          <p className={classes.disclaimer}>
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
  },
  snippet: {
    textAlign: 'left',
  },
  bullet: {
    textAlign: 'left',
    paddingLeft: '10px',
    paddingRight: '10px',
  },
  disclaimer: {
    fontSize: '12px',
    textAlign: 'left',
    paddingLeft: '10px',
    paddingRight: '10px',
    fontWeight: 'bold',
  },
  link: {
    fontWeight: 'bold',
    color: '#00B2FF',
    cursor: 'pointer',
    borderBottom: '1px solid #00B2FF',
  },
  openIcon: {
    textAlign: 'center',
  },
  iconContainer: {
    textTransform: 'Capitalize',
  },
  root: {
    '& button': {
      'width': '80px',
      'height': '50px',
      'border': 'none',
      '&.Mui-selected, &.Mui-selected:hover': {
        backgroundColor: '#97979770',
      },
    },
    '& svg': {
      width: '30px',
      height: '30px',
      fill: theme.palette.primary.contrastText,
    },
  },
  dropDown: {
    'width': '260px',
    '& .MuiOutlinedInput-input': {
      color: '#00B2FF',
    },
    // TODO(oleg): Find suited colors
    '& .MuiInputLabel-root': {
      color: '#00B2FF',
    },
    '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
      borderColor: '#00B2FF',
    },
    '&:hover .MuiOutlinedInput-input': {
      color: '#00B2FF',
    },
    '&:hover .MuiInputLabel-root': {
      color: '#00B2FF',
    },
    '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
      borderColor: '#00B2FF',
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
      color: '#00B2FF',
    },
    // TODO(oleg): Find suited colors
    '& .MuiInputLabel-root.Mui-focused': {
      color: '#00B2FF ',
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: '#00B2FF',
    },
  },
}),
)

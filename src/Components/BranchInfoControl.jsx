import React, {useState, useContext} from 'react'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import ToggleButton from '@mui/material/ToggleButton'
import {makeStyles, useTheme} from '@mui/styles'
import Dialog from './Dialog'
import {ColorModeContext} from '../Context/ColorMode'
import ModelsIcon from '../assets/2D_Icons/Model.svg'
import InfoIcon from '../assets/2D_Icons/Information.svg'

/**
 * Displays open warning.
 *
 * @return {object} React component
 */
export default function BranchInfoControl() {
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
            onClick={() => {
              setIsDialogDisplayed(true)
            }}
            color='primary'
            value={'something'}
          >
            <InfoIcon/>
          </ToggleButton>
        </Tooltip>
      </Paper>
      {isDialogDisplayed &&
        <BranchInfoDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
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
function BranchInfoDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const classes = useStyles()

  return (
    <Dialog
      icon={<ModelsIcon/>}
      headerText='Project Versioning'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={
        <div className={classes.content}>
          <p className={classes.bullet}>
            Different project versions can be stored in Github as seprate branches.
          </p>
          <p className={classes.bullet}>
            Example of a file with multiple branches is here:
            <br/>
            <a
              className={classes.link}
              target="_blank"
              href='https://bldrs.ai/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc'
              rel="noreferrer"
            >
              Versioned model
            </a>
          </p>
          <p className={classes.bullet}>
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
      'border': `1px solid ${theme.palette.highlight.heavy}`,
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

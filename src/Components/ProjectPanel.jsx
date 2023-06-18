/* eslint-disable no-magic-numbers */
import React, {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {RectangularButton} from './Buttons'
import useStore from '../store/useStore'
import useTheme from '@mui/styles/useTheme'
import Eisvogel from '../assets/icons/projects/Eisvogel.svg'
import Momentum from '../assets/icons/projects/Momentum.svg'
import Sheenstock from '../assets/icons/projects/Sheenstock.svg'
import Seestrasse from '../assets/icons/projects/Seestrasse.svg'
import DeleteIcon from '../assets/icons/Delete.svg'
import OpenIcon from '../assets/icons/Open.svg'
import UploadIcon from '../assets/icons/Upload.svg'
import GitHubIcon from '@mui/icons-material/GitHub'
import SwissProperty from '../assets/icons/SwissProperty.svg'
import {TooltipIconButton} from './Buttons'


const icon = (iconNumber) => {
  if (iconNumber === 0) {
    return <Momentum style={{width: '28px', height: '18px'}}/>
  }
  if (iconNumber === 1) {
    return <Sheenstock style={{width: '28px', height: '18px'}}/>
  }
  if (iconNumber === 2) {
    return <Eisvogel style={{width: '28px', height: '18px'}}/>
  }
  if (iconNumber === 3) {
    return <Seestrasse style={{width: '28px', height: '18px'}}/>
  }
}


const LoginComponent = () => {
  const theme = useTheme()
  return (
    <Typography
      variant={'h5'}
      sx={{
        padding: '14px',
      }}
    >
      Please&nbsp;
      <Box
        component="span"
        // onClick={onClick}
        sx={{
          color: theme.palette.secondary.contrastText,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >login
      </Box>
      &nbsp;to get access to your projects stored on GitHub or sign up for GitHub&nbsp;
      <Box
        component="span"
        // onClick={onClick}
        sx={{
          color: theme.palette.secondary.contrastText,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >here
      </Box>
      <Box sx={{marginTop: '10px'}}>To learn more about why we recommend GitHub for file hosting please visit our{' '}
        <a
          target="_blank"
          href='https://github.com/bldrs-ai/Share/wiki/GitHub-model-hosting'
          rel="noreferrer"
        >
          wiki
        </a>
      </Box>
    </Typography>
  )
}


/**
 * Controls group contains toggles for fileapth, branches, spatial navigation, and element type navigation
 *
 * @param {Function} modelPath object containing information about the location of the model
 * @return {React.Component}
 */
export default function ProjectPanel({fileOpen}) {
  const [showSample, setShowSample] = useState(true)
  const toggleShowProjectPanel = useStore((state) => state.toggleShowProjectPanel)
  const navigate = useNavigate()
  const theme = useTheme()

  const modelPath = {
    Momentum: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
    Schneestock: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    Eisvogel: '/share/v/gh/Swiss-Property-AG/Eisvogel-Public/main/EISVOGEL.ifc#c:107.36,8.46,156.67,3.52,2.03,16.71',
    Seestrasse: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
  }


  return (
    <Paper
      elevation={1}
      variant='control'
      sx={{
        display: 'flex',
        width: '280px',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        borderRadius: '10px',
        // opacity: .9,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          height: '60px',
          opacity: .9,
          fontWeight: '500',
          borderBottom: `1px solid ${theme.palette.background.button}`,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: '10px',
          }}
        >
          <OpenIcon/>
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          Projects
        </Box>
        <Box
          sx={{
            position: 'relative',
            left: '67px',
            cursor: 'pointer',
          }}
          onClick={toggleShowProjectPanel}
        >
          <DeleteIcon style={{width: '12px', height: '12px'}}/>
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Box
          sx={{
            'display': 'flex',
            'flexDirection': 'row',
            'justifyContent': 'center',
            'alignItems': 'center',
            // 'height': '100px',
            // 'width': '240px',
            'borderRadius': '10px',
            // 'backgroundColor': theme.palette.background.button,
            // 'border': `1px solid ${theme.palette.background.button}`,
            'marginTop': '10px',
            // 'marginBottom': '20px',
            'overflow': 'auto',
            'scrollbarWidth': 'none', /* Firefox */
            '-ms-overflow-style': 'none', /* Internet Explorer 10+ */
            '&::-webkit-scrollbar': {
              width: '0em',
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'transparent',
            },
          }}
        >
          <TooltipIconButton
            title={'SP'}
            onClick={() => setShowSample(true)}
            showTitle={true}
            selected={showSample}
            placement={'bottom'}
            icon={<SwissProperty style={{width: '18px', height: '18px'}}/>}
          />
          <TooltipIconButton
            title={'Login'}q
            placement={'bottom'}
            showTitle={true}
            selected={!showSample}
            onClick={() => setShowSample(false)}
            icon={<GitHubIcon style={{width: '18px', height: '18px'}}/>}
          />
        </Box>
        {showSample ?
        <Box
          sx={{
            'display': 'flex',
            'flexDirection': 'column',
            'justifyContent': 'flex-start',
            'alignItems': 'center',
            'height': '160px',
            'width': '240px',
            'borderRadius': '10px',
            'backgroundColor': theme.palette.background.button,
            'marginBottom': '20px',
            'marginTop': '10px',
            'overflow': 'auto',
            'scrollbarWidth': 'none', /* Firefox */
            '-ms-overflow-style': 'none', /* Internet Explorer 10+ */
            '&::-webkit-scrollbar': {
              width: '0em',
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'transparent',
            },
          }}
        >
          {Object.keys(modelPath).map((name, i) => {
            return (
              <Box
                key={i}
              >
                <RectangularButton
                  title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>{name}</Box>}
                  onClick={() => {
                    navigate(modelPath[name])
                  }}
                  icon={icon(i)}
                />
              </Box>
            )
          })}
        </Box> :
        <Box
          sx={{
            'display': 'flex',
            'flexDirection': 'column',
            'justifyContent': 'flex-start',
            'alignItems': 'center',
            'height': '160px',
            'width': '240px',
            'borderRadius': '10px',
            'backgroundColor': theme.palette.background.button,
            'marginBottom': '20px',
            'marginTop': '10px',
            'overflow': 'auto',
            'scrollbarWidth': 'none', /* Firefox */
            '-ms-overflow-style': 'none', /* Internet Explorer 10+ */
            '&::-webkit-scrollbar': {
              width: '0em',
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'transparent',
            },
          }}
        >
          <LoginComponent/>
        </Box>
        }
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          marginBottom: '20px',
        }}
      >
        <RectangularButton
          title={'Open local file '}
          onClick={() => {
            fileOpen()
          }}
          icon={<UploadIcon/>}
        />
      </Box>
    </Paper>
  )
}

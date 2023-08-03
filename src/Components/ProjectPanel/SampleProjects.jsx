/* eslint-disable no-magic-numbers */
import React from 'react'
import {useNavigate} from 'react-router-dom'
import useTheme from '@mui/styles/useTheme'
import Box from '@mui/material/Box'
import {RectangularButton} from '../Buttons'
// import useStore from '../../store/useStore'
import GitHubIcon from '@mui/icons-material/GitHub'
import Eisvogel from '../../assets/icons/projects/Eisvogel.svg'
import Momentum from '../../assets/icons/projects/Momentum.svg'
import Sheenstock from '../../assets/icons/projects/Sheenstock.svg'
import Seestrasse from '../../assets/icons/projects/Seestrasse.svg'


const icon = (iconNumber) => {
  if (iconNumber === 0) {
    return <Sheenstock style={{width: '28px', height: '18px'}}/>
  }
  if (iconNumber === 1) {
    return <Momentum style={{width: '28px', height: '18px'}}/>
  }
  if (iconNumber === 2) {
    return <Eisvogel style={{width: '28px', height: '18px'}}/>
  }
  if (iconNumber === 3) {
    return <Seestrasse style={{width: '28px', height: '18px'}}/>
  }
}

const SampleProjects = () => {
  // const toggleShowProjectPanel = useStore((state) => state.toggleShowProjectPanel)
  const navigate = useNavigate()
  const theme = useTheme()
  const modelPath = {
    Schneestock: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    Momentum: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
    Eisvogel: '/share/v/gh/Swiss-Property-AG/Eisvogel-Public/main/EISVOGEL.ifc#c:107.36,8.46,156.67,3.52,2.03,16.71',
    Seestrasse: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
  }
  const backgroundStyle = {
    'display': 'flex',
    'flexDirection': 'column',
    'justifyContent': 'flex-start',
    'alignItems': 'center',
    'width': '240px',
    'borderRadius': '10px',
    'padding': '6px 0px',
    'marginBottom': '10px',
    'marginTop': '10px',
    'overflow': 'auto',
    'border': `1px solid ${theme.palette.primary.main}`,
    'scrollbarWidth': 'none', /* Firefox */
    '-ms-overflow-style': 'none', /* Internet Explorer 10+ */
    '&::-webkit-scrollbar': {
      width: '0em',
      background: 'transparent',
    },
    '&::-webkit-scrollbar-thumb': {
      background: 'transparent',
    },
  }

  return (
    <>
      <Box sx={backgroundStyle}>
        {Object.keys(modelPath).map((name, i) => {
          return (
            <Box
              key={i}
              sx={{
                margin: '2px 0px',
              }}
            >
              <RectangularButton
                title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>{name}</Box>}
                onClick={() => {
                  navigate(modelPath[name])
                  // toggleShowProjectPanel()
                }}
                icon={icon(i)}
              />
            </Box>
          )
        })}
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          paddingTop: '4px',
          paddingBottom: '16px',
        }}
      >
        <RectangularButton
          title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>Sample repo</Box>}
          onClick={() => {
            window.open(
                'https://github.com/Swiss-Property-AG/Schneestock-Public', '_blank').focus()
          }}
          placement={'top'}
          icon={<GitHubIcon style={{width: '28px', height: '18px', opacity: '.5'}}/>}
        />
      </Box>
    </>
  )
}


export default SampleProjects

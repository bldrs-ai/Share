import React from 'react'
import {useNavigate} from 'react-router-dom'
import {useAuth0} from '@auth0/auth0-react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {RectangularButton} from '../Buttons'
import CommitIcon from '../../assets/icons/Commit.svg'
import Message from './Message'
import Container from './Container'


const SaveComponent = () => {
  const {isAuthenticated} = useAuth0()
  const navigate = useNavigate()
  const modelPath = {
    'Added another building': '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    'Chnage the walls': '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    'Check structure': '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    'Replace windows': '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    'Adjusted set back': '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    'Change profile': '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
  }

  return (
    <Box>
      {isAuthenticated &&
      <Container content={
        Object.keys(modelPath).map((name, i) => {
          return (
            <Box
              key={i}
              sx={{
                margin: '4px 0px',
              }}
            >
              <RectangularButton
                title={
                  <Box sx={{
                    fontSize: '.8em',
                    width: '100px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textAlign: 'left',
                    marginLeft: '10px',
                    textOverflow: 'ellipsis'}
                  }
                  >
                    {name}
                  </Box>}
                onClick={() => {
                  navigate(modelPath[name])
                }}
                icon={<CommitIcon style={{width: '11px', height: '50px', marginLeft: '-8px'}}/>}
              />
            </Box>
          )
        })}
      />
      }
      {!isAuthenticated &&
        <Message
          message={
            <Typography
              variant={'h5'}
              sx={{
                padding: '12px',
              }}
            >
              Please login to save your project on Github and to enable version history.
            </Typography>
          }
        />
      }
    </Box>
  )
}


export default SaveComponent

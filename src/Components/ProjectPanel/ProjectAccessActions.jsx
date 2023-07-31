import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Box from '@mui/material/Box'
import {RectangularButton} from '../Buttons'
import UploadIcon from '../../assets/icons/Upload.svg'
import GitHubIcon from '@mui/icons-material/GitHub'


const ProjectAccessActions = ({fileOpen, login}) => {
  const {isAuthenticated} = useAuth0()
  return (
    <>
      {isAuthenticated ?
      <>
        <RectangularButton
          title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>Import ifc</Box>}
          onClick={() => {
            fileOpen()
          }}
          placement={'top'}
          icon={<UploadIcon style={{width: '28px', height: '18px'}}/>}
        />
      </> :
      <>
        <RectangularButton
          title={'Login to GitHub'}
          onClick={() => {
            login()
          }}
          icon={<GitHubIcon style={{opacity: .5}}/>}
        />
        <Box
          sx={{
            paddingTop: '6px',
          }}
        >
          <RectangularButton
            title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>Import ifc</Box>}
            onClick={() => {
              fileOpen()
            }}
            placement={'top'}
            icon={<UploadIcon style={{width: '28px', height: '18px', paddingLeft: '5px'}}/>}
          />
        </Box>
      </>
      }
    </>
  )
}

export default ProjectAccessActions

/* eslint-disable no-magic-numbers */
import React, {useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {useAuth0} from '@auth0/auth0-react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {RectangularButton} from './Buttons'
import useStore from '../store/useStore'
import useTheme from '@mui/styles/useTheme'
import Selector from './Selector'
import Eisvogel from '../assets/icons/projects/Eisvogel.svg'
import Momentum from '../assets/icons/projects/Momentum.svg'
import Sheenstock from '../assets/icons/projects/Sheenstock.svg'
import Seestrasse from '../assets/icons/projects/Seestrasse.svg'
import DeleteIcon from '../assets/icons/Delete.svg'
import ViewCube from '../assets/icons/view/ViewCube1.svg'
import LoginIcon from '../assets/icons/Login.svg'
import UploadIcon from '../assets/icons/Upload.svg'
// import ProceedIcon from '../assets/icons/Proceed.svg'
import GitHubIcon from '@mui/icons-material/GitHub'
import SwissProperty from '../assets/icons/SwissProperty.svg'
import OpenIcon from '../assets/icons/OpenFolder.svg'
import {TooltipIconButton} from './Buttons'
// import OpenModelControl from '../Components/OpenModelControl'
import {getOrganizations, getRepositories, getFiles, getUserRepositories} from '../utils/GitHub'


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


const LoginComponent = () => {
  const theme = useTheme()

  return (
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
      <Typography
        variant={'h5'}
        sx={{
          padding: '14px',
        }}
      >
        Please login to get access to your projects stored on GitHub or sign up for GitHub&nbsp;
        <Box
          component="span"
          onClick={() => {
            window.open(
                'https://github.com/signup?ref_cta=Sign+up&ref_loc=header+logged+out&ref_page=%2F&source=header-home', '_blank').focus()
          }}
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
    </Box>
  )
}

const ProjectAccess = () => {
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [orgNamesArr, setOrgNamesArray] = useState([''])
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const navigate = useNavigate()
  const accessToken = useStore((state) => state.accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const fileName = filesArr[selectedFileName]
  const {user} = useAuth0()
  // const theme = useTheme()

  useEffect(() => {
    /**
     * Asynchronously fetch organizations
     *
     * @return {Array} organizations
     */
    async function fetchOrganizations() {
      const orgs = await getOrganizations(accessToken)
      const orgNamesFetched = Object.keys(orgs).map((key) => orgs[key].login)
      const orgNames = [...orgNamesFetched, user && user.nickname]
      setOrgNamesArray(orgNames)
      return orgs
    }

    if (accessToken) {
      fetchOrganizations()
    }
  }, [accessToken, user])


  const selectOrg = async (org) => {
    setSelectedOrgName(org)
    let repos
    if (orgNamesArr[org] === user.nickname) {
      repos = await getUserRepositories(user.nickname, accessToken)
    } else {
      repos = await getRepositories(orgNamesArr[org], accessToken)
    }
    const repoNames = Object.keys(repos).map((key) => repos[key].name)
    setRepoNamesArr(repoNames)
  }

  const selectRepo = async (repo) => {
    setSelectedRepoName(repo)
    const owner = orgNamesArr[selectedOrgName]
    const files = await getFiles(repoNamesArr[repo], owner, accessToken)
    const fileNames = Object.keys(files).map((key) => files[key].name)
    setFilesArr(fileNames)
  }

  const navigateToFile = () => {
    if (filesArr[selectedFileName].includes('.ifc')) {
      navigate({pathname: `/share/v/gh/${orgName}/${repoName}/main/${fileName}`})
    }
  }

  return (
    <Box
      sx={{
        'display': 'flex',
        'flexDirection': 'column',
        'justifyContent': 'flex-start',
        'alignItems': 'center',
        // 'height': '200px',
        'width': '240px',
        'borderRadius': '10px',
        // 'backgroundColor': theme.palette.background.button,
        // 'border': `1px solid ${theme.palette.background.button} `,
        // 'marginBottom': '20px',
        // 'marginTop': '10px',
        'paddingTop': '10px',
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
      <Selector label={'Organization'} list={orgNamesArrWithAt} selected={selectedOrgName} setSelected={selectOrg}/>
      <Selector label={'Repository'} list={repoNamesArr} selected={selectedRepoName} setSelected={selectRepo} testId={'Repository'}/>
      <Selector label={'File'} list={filesArr} selected={selectedFileName} setSelected={setSelectedFileName} testId={'File'}/>
      {selectedFileName !== '' &&
        <Box sx={{textAlign: 'center', marginTop: '4px'}}>
          <RectangularButton title={'Load file'} icon={<UploadIcon/>} onClick={navigateToFile}/>
        </Box>
      }
    </Box>
  )
}


/**
 * Controls group contains toggles for fileapth, branches, spatial navigation, and element type navigation
 *
 * @param {Function} modelPath object containing information about the location of the model
 * @return {React.Component}
 */
export default function ProjectPanel({fileOpen, modelPathDefined, isLocalModel}) {
  const [showSample, setShowSample] = useState(true)
  const toggleShowProjectPanel = useStore((state) => state.toggleShowProjectPanel)
  const navigate = useNavigate()
  const theme = useTheme()
  const {isAuthenticated, loginWithRedirect} = useAuth0()
  useEffect(() => {
    if (isAuthenticated) {
      setShowSample(false)
    }
  }, [isAuthenticated])

  const login = async () => {
    await loginWithRedirect({
      appState: {
        returnTo: window.location.pathname,
      },
    })
  }

  const modelPath = {
    Schneestock: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    Momentum: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
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
        opacity: .95,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0px 20px',
          height: '60px',
          fontWeight: '500',
          borderBottom: `1px solid ${theme.palette.background.button}`,
        }}
      >
        <Box
          sx={{
            width: '240px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: '12px',
              paddingBottom: '2px',
            }}
          >
            <ViewCube/>
          </Box>
          <Typography variant='h4'
            sx={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {showSample ? 'Sample Projects' : 'Projects'}
          </Typography>
        </Box>
        <Box
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
            'borderRadius': '10px',
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
          <TooltipIconButton
            title={'Swiss Property Projects'}
            onClick={() => setShowSample(true)}
            selected={showSample}
            placement={'bottom'}
            icon={<SwissProperty style={{width: '24px', height: '24px'}}/>}
          />
          {!isAuthenticated &&
          <TooltipIconButton
            title={'Login with Github Account'}
            placement={'bottom'}
            selected={!showSample}
            onClick={() => setShowSample(false)}
            icon={<LoginIcon style={{width: '20px', height: '20px'}}/>}
          />
          }
          {/* {isAuthenticated && <OpenModelControl modelPath={modelPathDefined} fileOpen={fileOpen} isLocalModel={isLocalModel}/>} */}
          {isAuthenticated &&
          <TooltipIconButton
            title={'Project Access'}
            placement={'bottom'}
            selected={!showSample}
            onClick={() => setShowSample(false)}
            icon={<OpenIcon style={{width: '20px', height: '20px'}}/>}
          />}
        </Box>
        {showSample ?
        <Box
          sx={{
            'display': 'flex',
            'flexDirection': 'column',
            'justifyContent': 'flex-start',
            'alignItems': 'center',
            'height': '190px',
            'width': '240px',
            'borderRadius': '10px',
            'border': `1px solid ${theme.palette.background.button}`,
            'padding': '6px 0px',
            'marginBottom': '10px',
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
                sx={{
                  margin: '2px 0px',
                }}
              >
                <RectangularButton
                  title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>{name}</Box>}
                  onClick={() => {
                    navigate(modelPath[name])
                    toggleShowProjectPanel()
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
            // 'height': '220px',
            'width': '240px',
            'borderRadius': '10px',
            // 'backgroundColor': theme.palette.background.button,
            'marginBottom': '14px',
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
          {!isAuthenticated &&
            <>
              <LoginComponent/>
              <RectangularButton
                title={'Login to GitHub'}
                onClick={() => {
                  login()
                }}
                icon={<GitHubIcon style={{opacity: .5}}/>}
              />
            </>
          }
          {isAuthenticated &&
            <>
              <ProjectAccess/>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <TooltipIconButton
                  title={'Open from your computer'}
                  onClick={() => {
                    fileOpen()
                  }}
                  placement={'bottom'}
                  icon={<UploadIcon style={{opacity: .9}}/>}
                />
                <TooltipIconButton
                  title={'Open from GitHub'}
                  // selected={true}
                  onClick={() => {
                    fileOpen()
                  }}
                  placement={'bottom'}
                  icon={<GitHubIcon style={{width: '22px', height: '22px', opacity: .9}}/>}
                />
              </Box>
            </>
          }

        </Box>
        }
      </Box>
      {showSample &&
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            marginBottom: '10px',
          }}
        >
          <TooltipIconButton
            title={'Open from your computer'}
            onClick={() => {
              fileOpen()
            }}
            // selected={true}
            placement={'bottom'}
            icon={<UploadIcon/>}
          />
        </Box>
      }

    </Paper>
  )
}

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
import ViewCube1 from '../assets/icons/view/ViewCube1.svg'
import ViewCube2 from '../assets/icons/view/ViewCube2.svg'
import ViewCube3 from '../assets/icons/view/ViewCube3.svg'
import LoginIcon from '../assets/icons/Login.svg'
import UploadIcon from '../assets/icons/Upload.svg'
import SaveIcon from '../assets/icons/Save.svg'
import ExportIcon from '../assets/icons/Export.svg'
import GitHubIcon from '@mui/icons-material/GitHub'
import SwissProperty from '../assets/icons/SwissProperty.svg'
import OpenIcon from '../assets/icons/OpenFolder.svg'
import {TooltipIconButton} from './Buttons'
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

const SaveComponent = () => {
  const theme = useTheme()

  return (
    <Box
      sx={{
        'display': 'flex',
        'flexDirection': 'column',
        'justifyContent': 'flex-start',
        'alignItems': 'center',
        'height': '80px',
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
          textalign: 'left',
        }}
      >
        Please login to save your project on Github and to enable version history.
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
  const toggleShowProjectPanel = useStore((state) => state.toggleShowProjectPanel)
  const accessToken = useStore((state) => state.accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const fileName = filesArr[selectedFileName]
  const {user} = useAuth0()

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
      toggleShowProjectPanel()
    }
  }

  return (
    <Box
      sx={{
        'display': 'flex',
        'flexDirection': 'column',
        'justifyContent': 'flex-start',
        'alignItems': 'center',
        'width': '240px',
        'borderRadius': '10px',
        'paddingTop': '10px',
        'paddingBottom': '10px',
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
      <Box sx={{textAlign: 'center', marginTop: '4px', marginBottom: '8px'}}>
        <RectangularButton
          title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>Access project</Box>}
          onClick={() => {
            navigateToFile()
          }}
          placement={'top'}
          icon={<GitHubIcon style={{width: '28px', height: '20px', opacity: .5}}/>}
        />
      </Box>
      }
    </Box>
  )
}

const TitleBar = ({showMode}) => {
  const toggleShowProjectPanel = useStore((state) => state.toggleShowProjectPanel)
  const theme = useTheme()
  return (
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
          {showMode === 'sample' && <ViewCube1/> }
          {showMode === 'projects' && <ViewCube2/> }
          {showMode === 'save' && <ViewCube3/> }

        </Box>
        <Typography variant='h4'
          sx={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {showMode === 'sample' && 'Sample Projects' }
          {showMode === 'projects' && 'Projects' }
          {showMode === 'save' && 'Save Projects' }
        </Typography>
      </Box>
      <Box
        onClick={toggleShowProjectPanel}
      >
        <DeleteIcon style={{width: '12px', height: '12px'}}/>
      </Box>
    </Box>
  )
}

const ProjectsOptions = ({showMode, setShowMode}) => {
  const {isAuthenticated} = useAuth0()
  return (
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
        onClick={() => setShowMode('sample')}
        selected={showMode === 'sample'}
        placement={'top'}
        icon={<SwissProperty style={{width: '24px', height: '24px'}}/>}
      />

      {!isAuthenticated &&
      <TooltipIconButton
        title={'Login with Github Account'}
        placement={'top'}
        selected={showMode === 'projects'}
        onClick={() => setShowMode('projects')}
        icon={<LoginIcon style={{width: '21px', height: '21px'}}/>}
      />
      }

      {isAuthenticated &&
      <TooltipIconButton
        title={'Project Access'}
        placement={'top'}
        selected={showMode === 'projects'}
        onClick={() => setShowMode('projects')}
        icon={<OpenIcon style={{width: '20px', height: '20px'}}/>}
      />}

      {!isAuthenticated &&
      <TooltipIconButton
        title={'Save Project'}
        placement={'top'}
        selected={showMode === 'save'}
        onClick={() => setShowMode('save')}
        icon={<SaveIcon style={{width: '20px', height: '20px'}}/>}
      />
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
  const [showMode, setShowMode] = useState('sample')
  const toggleShowProjectPanel = useStore((state) => state.toggleShowProjectPanel)
  const navigate = useNavigate()
  const theme = useTheme()
  const {isAuthenticated, loginWithRedirect} = useAuth0()
  useEffect(() => {
    if (isAuthenticated) {
      setShowMode('projects')
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

  const backgroundStyle = {
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
      <TitleBar showMode={showMode}/>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ProjectsOptions showMode={showMode} setShowMode={setShowMode}/>
        {showMode === 'sample' &&
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
                    toggleShowProjectPanel()
                  }}
                  icon={icon(i)}
                />
              </Box>
            )
          })}
        </Box>}

        {showMode === 'sample' &&
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              paddingBottom: '26px',
              paddingTop: '16px',
            }}
          >
            <RectangularButton
              title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>Open local</Box>}
              onClick={() => {
                fileOpen()
              }}
              placement={'top'}
              icon={<UploadIcon style={{width: '28px', height: '18px', opacity: .5}}/>}
            />
          </Box>
        }

        {showMode === 'projects' &&
          <Box
            sx={{
              'display': 'flex',
              'flexDirection': 'column',
              'justifyContent': 'flex-start',
              'alignItems': 'center',
              'width': '240px',
              'borderRadius': '10px',
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
              <Box sx={{paddingBottom: '6px', textAlign: 'center'}}>
                <LoginComponent/>
                <RectangularButton
                  title={'Login to GitHub'}
                  onClick={() => {
                    login()
                  }}
                  icon={<GitHubIcon style={{opacity: .5}}/>}
                />
              </Box>
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
                    paddingBottom: '10px',
                  }}
                >
                  <RectangularButton
                    title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>Open local</Box>}
                    onClick={() => {
                      fileOpen()
                    }}
                    placement={'top'}
                    icon={<UploadIcon style={{width: '28px', height: '18px', opacity: .5}}/>}
                  />
                </Box>
              </>
            }
          </Box>
        }
        {showMode === 'save' &&
          <Box
            sx={{
              'display': 'flex',
              'flexDirection': 'column',
              'justifyContent': 'flex-start',
              'alignItems': 'center',
              'width': '240px',
              'borderRadius': '10px',
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
              <Box sx={{paddingBottom: '6px', textAlign: 'center'}}>
                <SaveComponent/>
                <Box sx={{
                  height: '90px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                >
                  <RectangularButton
                    title={'Login to GitHub'}
                    onClick={() => {
                      login()
                    }}
                    icon={<GitHubIcon style={{opacity: .5}}/>}
                  />
                  <RectangularButton
                    title={'Export'}
                    onClick={() => {
                      login()
                    }}
                    icon={<ExportIcon/>}
                  />
                </Box>
              </Box>
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
                    paddingBottom: '10px',
                  }}
                >
                  <RectangularButton
                    title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>Open local</Box>}
                    onClick={() => {
                      fileOpen()
                    }}
                    placement={'top'}
                    icon={<UploadIcon style={{width: '28px', height: '18px', opacity: .5}}/>}
                  />
                </Box>
              </>
            }
          </Box>}
      </Box>
    </Paper>
  )
}

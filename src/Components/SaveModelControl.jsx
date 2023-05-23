import React, {useState, useEffect} from 'react'
// import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import useTheme from '@mui/styles/useTheme'
import {useAuth0} from '@auth0/auth0-react'
import Dialog from './Dialog'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
// import {handleBeforeUnload} from '../utils/event'
import {getOrganizations} from '../utils/GitHub'
import SaveIcon from '../assets/icons/Save.svg'


/**
 * Displays model Save dialog.
 *
 * @return {React.ReactElement}
 */
export default function SaveModelControl({fileSave, modelPath}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const {user} = useAuth0()
  const accessToken = useStore((state) => state.accessToken)
  useEffect(() => {
    /**
     * Asynchronously fetch organizations
     *
     * @return {Array} organizations
     */
    async function fetchOrganizations() {
      const orgs = await getOrganizations(accessToken)
      return orgs
    }

    if (accessToken) {
      fetchOrganizations()
    }
  }, [accessToken, user])


  return (
    <Box>
      <TooltipIconButton
        title={'Save project'}
        onClick={() => setIsDialogDisplayed(true)}
        icon={<SaveIcon/>}
        placement={'bottom'}
        // selected={isDialogDisplayed}
        dataTestId='Save-ifc'
      />
      {isDialogDisplayed &&
        <SaveModelDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
          // fileSave={fileSave}
          // orgNamesArr={orgNamesArr}
        />
      }
    </Box>
  )
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function SaveModelDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const {isAuthenticated, loginWithRedirect} = useAuth0()
  const theme = useTheme()

  const SaveFile = () => {
    // fileSave()
    setIsDialogDisplayed(false)
  }

  const logIn = async () => {
    await loginWithRedirect({
      appState: {
        returnTo: window.location.pathname,
      },
    })
  }

  const signupForGithub = () => {
    window.open('https://github.com/join', '_blank')
  }

  // const selectOrg = async (org) => {
  //   setSelectedOrgName(org)
  //   let repos
  //   if (orgNamesArr[org] === user.nickname) {
  //     repos = await getUserRepositories(user.nickname, accessToken)
  //   } else {
  //     repos = await getRepositories(orgNamesArr[org], accessToken)
  //   }
  //   const repoNames = Object.keys(repos).map((key) => repos[key].name)
  //   setRepoNamesArr(repoNames)
  // }

  // const selectRepo = async (repo) => {
  //   setSelectedRepoName(repo)
  //   const owner = orgNamesArr[selectedOrgName]
  //   const files = await getFiles(repoNamesArr[repo], owner, accessToken)
  //   const fileNames = Object.keys(files).map((key) => files[key].name)
  //   setFilesArr(fileNames)
  // }

  // const navigateToFile = () => {
  //   if (filesArr[selectedFileName].includes('.ifc')) {
  //     navigate({pathname: `/share/v/gh/${orgName}/${repoName}/main/${fileName}`})
  //   }
  // }

  return (
    <Dialog
      icon={<SaveIcon/>}
      headerText={'Save'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'Save model'}
      actionCb={SaveFile}
      content={
        <Box
          sx={{
            width: '260px',
            paddingTop: '6px',
            textAlign: 'left',
          }}
        >
          {isAuthenticated ?
          <Box>
            <SampleModelFileSelector title={'Organization'}/>
            <SampleModelFileSelector title={'Repository'}/>
            <SampleModelFileSelector title={'Folder'}/>
          </Box> :
          <Typography
            variant={'h4'}
            sx={{
              border: `1px solid ${theme.palette.primary.main}`,
              borderRadius: '5px',
              padding: '12px',
            }}
          >
            Please&nbsp;
            <Box
              component="span"
              onClick={logIn}
              sx={{
                color: theme.palette.secondary.contrastText,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >login
            </Box>
            &nbsp;to save your file on GitHub.
            <Box>
            If you do not have a GitHub account please sign up&nbsp;
              <Box
                component="span"
                onClick={signupForGithub}
                sx={{
                  color: theme.palette.secondary.contrastText,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >here
              </Box>
            </Box>
          </Typography>
          }
        </Box>
      }
    />
  )
}


/**
 * @property {Function} setIsDialogDisplayed callback
 * @return {React.ReactElement}
 */
function SampleModelFileSelector({setIsDialogDisplayed, title}) {
  const theme = useTheme()

  return (
    <TextField
      sx={{
        'width': '260px',
        'marginBottom': '10px',
        '& .MuiOutlinedInput-input': {
          color: theme.palette.secondary.main,
        },
        '& .MuiInputLabel-root': {
          color: theme.palette.secondary.main,
        },
        '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.palette.secondary.main,
        },
        '&:hover .MuiOutlinedInput-input': {
          color: theme.palette.secondary.main,
        },
        '&:hover .MuiInputLabel-root': {
          color: theme.palette.secondary.main,
        },
        '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.palette.secondary.main,
        },
        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
          color: theme.palette.secondary.main,
        },
        '& .MuiInputLabel-root.Mui-focused': {
          color: theme.palette.secondary.main,
        },
        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.palette.secondary.main,
        },
      }}
      variant='outlined'
      label={title}
      select
      size='small'
    >
      <MenuItem value={1}><Typography variant='p'>1</Typography></MenuItem>
      <MenuItem value={2}><Typography variant='p'>2</Typography></MenuItem>
      <MenuItem value={3}><Typography variant='p'>3</Typography></MenuItem>
    </TextField>
  )
}

import React, {useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import {useAuth0} from '@auth0/auth0-react'
import Dialog from './Dialog'
import {TooltipIconButton} from './Buttons'
import Selector from './Selector'
import useStore from '../store/useStore'
import {getOrganizations, getRepositories, getFiles, getUserRepositories} from '../utils/GitHub'
import {RectangularButton} from '../Components/Buttons'
import OpenIcon from '../assets/icons/OpenFolder.svg'
import UploadIcon from '../assets/icons/Upload.svg'
import GitHubIcon from '@mui/icons-material/GitHub'


/**
 * Displays model open dialog.
 *
 * @return {React.ReactElement}
 */
export default function OpenModelControl({fileOpen, modelPath, isLocalModel}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const [orgNamesArr, setOrgNamesArray] = useState([''])
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
      const orgNamesFetched = Object.keys(orgs).map((key) => orgs[key].login)
      const orgNames = [...orgNamesFetched, user && user.nickname]
      setOrgNamesArray(orgNames)
      return orgs
    }

    if (accessToken) {
      fetchOrganizations()
    }
  }, [accessToken, user])


  return (
    <Box>
      <TooltipIconButton
        title={'Projects'}
        showTitle={false}
        onClick={() => setIsDialogDisplayed(true)}
        icon={<OpenIcon style={{width: '20px', height: '22px', opacity: .7}}/>}
        placement={'bottom'}
        selected={isDialogDisplayed}
        dataTestId='open-ifc'
      />
      {isDialogDisplayed &&
        <OpenModelDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
          fileOpen={fileOpen}
          orgNamesArr={orgNamesArr}
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
function OpenModelDialog({isDialogDisplayed, setIsDialogDisplayed, fileOpen, orgNamesArr}) {
  const {isAuthenticated, user, loginWithRedirect} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const theme = useTheme()
  const navigate = useNavigate()
  const accessToken = useStore((state) => state.accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const fileName = filesArr[selectedFileName]

  const openFile = () => {
    fileOpen()
    setIsDialogDisplayed(false)
  }

  const onClick = async () => {
    await loginWithRedirect({
      appState: {
        returnTo: window.location.pathname,
      },
    })
  }

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
    <Dialog
      icon={<GitHubIcon style={{opacity: .5}}/>}
      headerText={'Access'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'Import'}
      showActionButton={false}
      actionIcon={<UploadIcon/>}
      actionCb={openFile}
      content={
        <Box
          sx={{
            width: '260px',
            paddingTop: '6px',
            textAlign: 'left',
          }}
        >
          {isAuthenticated ?
          <Box sx={{marginTop: '10px'}}>
            <Selector label={'Organization'} list={orgNamesArrWithAt} selected={selectedOrgName} setSelected={selectOrg}/>
            <Selector label={'Repository'} list={repoNamesArr} selected={selectedRepoName} setSelected={selectRepo} testId={'Repository'}/>
            <Selector label={'File'} list={filesArr} selected={selectedFileName} setSelected={setSelectedFileName} testId={'File'}/>
            {selectedFileName !== '' &&
              <Box sx={{textAlign: 'center', marginTop: '4px'}}>
                <RectangularButton title={'Load file'} icon={<UploadIcon/>} onClick={navigateToFile}/>
              </Box>
            }
          </Box> :
          <Typography
            variant={'h4'}
            sx={{
              border: `1px solid ${theme.palette.primary.main}`,
              borderRadius: '5px',
              padding: '12px',
              marginTop: '16px',
            }}
          >
            Please&nbsp;
            <Box
              component="span"
              onClick={onClick}
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
              onClick={onClick}
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
          }

          {isAuthenticated &&
            <Box
              sx={{
                marginTop: '1em',
                fontSize: '.8em',
                marginBottom: '.5em',
              }}
            >
              <div>To access the required model on GitHub:</div>

              <ul>
                <li>Select the correct organization.</li>
                <li>Find the relevant repository.</li>
                <li>Choose the project file you need.</li>
              </ul>
              <div>Currently you can only open .ifc models, support for .obj format comming soon.</div>
            </Box>
          }
          {isAuthenticated &&
          orgName !== undefined &&
          repoName !== undefined &&
            <Box
              sx={{
                marginTop: '1em',
                fontSize: '.8em',
              }}
            >
              Project Owners:
              <br/>
              Click&nbsp;
              <a
                href={`https://github.com/${orgName}/${repoName}/settings/access`}
                target="_blank"
                rel="noreferrer"
              >
                here
              </a>
              &nbsp;to manage access to the project
            </Box>
          }
        </Box>
      }
    />
  )
}

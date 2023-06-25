import React, {useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import {useAuth0} from '@auth0/auth0-react'
import Selector from './Selector'
import useStore from '../store/useStore'
import {getOrganizations, getRepositories, getFiles, getUserRepositories} from '../utils/GitHub'
import {RectangularButton} from './Buttons'
import UploadIcon from '../assets/icons/Upload.svg'


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
export function OpenModelSelector({isDialogDisplayed, setIsDialogDisplayed, fileOpen}) {
  const {isAuthenticated, user, loginWithRedirect} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [orgNamesArr, setOrgNamesArray] = useState([''])
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const theme = useTheme()
  const navigate = useNavigate()
  const accessToken = useStore((state) => state.accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const fileName = filesArr[selectedFileName]

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


  // const openFile = () => {
  //   fileOpen()
  //   setIsDialogDisplayed(false)
  // }

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
  )
}

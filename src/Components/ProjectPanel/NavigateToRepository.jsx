import React, {useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {useAuth0} from '@auth0/auth0-react'
import Box from '@mui/material/Box'
import {RectangularButton} from '../Buttons'
import useStore from '../../store/useStore'
import Selector from '../Selector'
import GitHubIcon from '@mui/icons-material/GitHub'
import {getOrganizations, getRepositories, getFiles, getUserRepositories} from '../../utils/GitHub'


const NavigateToRepository = () => {
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
        'paddingBottom': '6px',
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
      <Box sx={{textAlign: 'center', marginTop: '4px'}}>
        <RectangularButton
          title={<Box sx={{width: '200px', textAlign: 'left', marginLeft: '10px'}}>Access project</Box>}
          onClick={() => {
            navigateToFile()
          }}
          placement={'top'}
          icon={<GitHubIcon style={{width: '28px', height: '20px', opacity: .5}}/>}
        />
      </Box>
    </Box>
  )
}

export default NavigateToRepository

import React, {ReactElement, useState, useEffect} from 'react'
import Button from '@mui/material/Button'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {navigateBaseOnModelPath} from '../../utils/location'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {pathSuffixSupported} from '../../Filetype'
import {getFilesAndFolders} from '../../net/github/Files'
import {getRepositories, getUserRepositories} from '../../net/github/Repositories'
import useStore from '../../store/useStore'
import Selector from './Selector'
import SelectorSeparator from './SelectorSeparator'

/**
 * @property {Function} navigate Callback from CadView to change page url
 * @property {Array<string>} orgNamesArr List of org names for the current user.
 * @property {Function} setIsDialogDisplayed callback
 * @return {ReactElement}
 */
export default function GitHubFileBrowser({
  navigate,
  orgNamesArr,
  setIsDialogDisplayed,
}) {
  const [currentPath, setCurrentPath] = useState('')
  const [foldersArr, setFoldersArr] = useState([''])
  const {user} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFolderName, setSelectedFolderName] = useState('')
  const [selectedFileIndex, setSelectedFileIndex] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const accessToken = useStore((state) => state.accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const fileName = filesArr[selectedFileIndex]

  useEffect(() => {
    if (orgNamesArr.length > 0) {
      setLoadingOrgs(false)
    }
  }, [orgNamesArr])

  const selectOrg = async (org) => {
    setSelectedOrgName(org)
    setLoadingRepos(true)
    let repos
    if (orgNamesArr[org] === user.nickname) {
      repos = await getUserRepositories(accessToken)
    } else {
      repos = await getRepositories(orgNamesArr[org], accessToken)
    }
    const repoNames = Object.keys(repos).map((key) => repos[key].name)
    setRepoNamesArr(repoNames)
    setCurrentPath('')
    setFoldersArr([''])
    setSelectedFolderName('')
    setSelectedFileIndex('')
    setSelectedRepoName('')
    setLoadingRepos(false)
  }

  const selectRepo = async (repo) => {
    setSelectedRepoName(repo)
    setLoadingFolders(true)
    const owner = orgNamesArr[selectedOrgName]
    const {files, directories} = await getFilesAndFolders(repoNamesArr[repo], owner, '/', accessToken)

    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)

    setFilesArr(fileNames)
    const foldersArrWithSeparator = [
      ...directoryNames,
    ]
    setFoldersArr([...foldersArrWithSeparator])
    setCurrentPath('')
    setSelectedFileIndex('')
    setLoadingFolders(false)
  }

  const selectFolder = async (folderIndex) => {
    const owner = orgNamesArr[selectedOrgName]
    const selectedFolderName_ = foldersArr[folderIndex]
    let newPath
    if (selectedFolderName_ === '[Parent Directory]') {
      const pathSegments = currentPath.split('/').filter(Boolean)
      pathSegments.pop()
      newPath = pathSegments.join('/')
    } else {
      newPath = selectedFolderName_ === '/' ? '' : `${currentPath}/${selectedFolderName_}`.replace('//', '/')
    }

    setSelectedFolderName(foldersArr[folderIndex])
    setCurrentPath(newPath)
    setLoadingFiles(true)
    const {files, directories} = await getFilesAndFolders(repoName, owner, newPath, accessToken)
    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)
    const navigationOptions = newPath ? ['[Parent Directory]', ...directoryNames] : [...directoryNames]

    setFilesArr(fileNames)
    const foldersArrWithSeparator = [
      ...navigationOptions,
    ]
    setFoldersArr(foldersArrWithSeparator)
    setLoadingFiles(false)
  }

  const navigateToFile = () => {
    if (pathSuffixSupported(fileName)) {
      navigate({pathname: navigateBaseOnModelPath(orgName, repoName, 'main', `${currentPath}/${fileName}`)})
      setIsDialogDisplayed(false)
    }
  }

  return (
    <Stack
      spacing={1}
      data-testid={'stack_gitHub_access_controls'}
    >
      <Typography variant='overline'>
        Browse files on Github
      </Typography>
      <Selector
        label='Organization'
        list={orgNamesArrWithAt}
        selected={selectedOrgName}
        setSelected={selectOrg}
        loading={loadingOrgs || undefined}
        data-testid='openOrganization'
      />
      <Selector
        label='Repository'
        list={repoNamesArr}
        loading={loadingRepos || undefined}
        selected={selectedRepoName}
        setSelected={selectRepo}
        data-testid='openRepository'
        disabled={selectedOrgName.length === 0}
      />
      <Breadcrumbs
        maxItems={4}
        aria-label="breadcrumb"
        color='primary'
        sx={{width: '260px', paddingLeft: '.5em'}}
      >
        <Typography color="primary" variant='body2'>Path:</Typography>
        {currentPath.split('/').filter(Boolean).map((segment, index) => (
          <Typography key={index} color="primary" variant='body2'>
            {segment}
          </Typography>
        ))}
      </Breadcrumbs>
      <SelectorSeparator
        label='Folder'
        list={foldersArr}
        selected={selectedFolderName}
        setSelected={selectFolder}
        loading={loadingFolders || undefined}
        data-testid='saveFolder'
        disabled={selectedRepoName.length === 0 && foldersArr.length === 1}
      />
      <Selector
        label='File'
        list={filesArr}
        selected={selectedFileIndex}
        setSelected={setSelectedFileIndex}
        loading={loadingFiles || undefined}
        data-testid='openFile'
        disabled={selectedRepoName.length === 0}
      />
      <Button
        onClick={navigateToFile}
        disabled={selectedFileIndex === ''}
        variant='contained'
        data-testid='button-openfromgithub'
      >
        Open from Github
      </Button>
    </Stack>
  )
}

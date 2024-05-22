import React, {ReactElement, useState} from 'react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Selector from './Selector'
import SelectorSeparator from './SelectorSeparator'
import useStore from '../../store/useStore'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {getFilesAndFolders} from '../../net/github/Files'
import {getRepositories, getUserRepositories} from '../../net/github/Repositories'


/**
 * @property {Function} navigate Callback from CadView to change page url
 * @property {Array<string>} orgNamesArr List of org names for the current user.
 * @return {ReactElement}
 */
export default function GitHubFileBrowser({
  navigate,
  orgNamesArr,
}) {
  const [currentPath, setCurrentPath] = useState('')
  const [foldersArr, setFoldersArr] = useState([''])
  const {user} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFolderName, setSelectedFolderName] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const accessToken = useStore((state) => state.accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const fileName = filesArr[selectedFileName]

  const selectOrg = async (org) => {
    setSelectedOrgName(org)
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
    setSelectedFileName('')
    setSelectedRepoName('')
  }
  const selectRepo = async (repo) => {
    setSelectedRepoName(repo)
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
    setSelectedFolderName('')
    setSelectedFileName('')
  }

  const selectFolder = async (folderIndex) => {
    const owner = orgNamesArr[selectedOrgName]

    // Get the selected folder name using the index
    const selectedFolderName_ = foldersArr[folderIndex]

    let newPath
    if (selectedFolderName_ === '[Parent Directory]') {
      // Move one directory up
      const pathSegments = currentPath.split('/').filter(Boolean)
      pathSegments.pop()
      newPath = pathSegments.join('/')
    } else {
      // Navigate into a subfolder or stay at the root
      newPath = selectedFolderName_ === '/' ? '' : `${currentPath}/${selectedFolderName_}`.replace('//', '/')
    }

    setSelectedFolderName('none')

    setCurrentPath(newPath)

    const {files, directories} = await getFilesAndFolders(repoName, owner, newPath, accessToken)

    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)

    // Adjust navigation options based on the current level
    const navigationOptions = newPath ? ['[Parent Directory]', ...directoryNames] : [...directoryNames]

    setFilesArr(fileNames)
    const foldersArrWithSeparator = [
      ...navigationOptions, // All the folders
    ]
    setFoldersArr(foldersArrWithSeparator)
  }
  const navigateToFile = () => {
    if (filesArr[selectedFileName].includes('.ifc')) {
      navigate({pathname: `/share/v/gh/${orgName}/${repoName}/main${currentPath}/${fileName}`})
    }
  }
  return (
    <Stack data-testid={'GitHub_access_controls'}>
      <Stack>
          <Typography variant='overline'>
            Open file from Github
          </Typography>
          <Selector
            label='Organization'
            list={orgNamesArrWithAt}
            selected={selectedOrgName}
            setSelected={selectOrg}
            data-testid='openOrganization'
          />
          <Selector
            label='Repository'
            list={repoNamesArr}
            selected={selectedRepoName}
            setSelected={selectRepo}
            data-testid='openRepository'
          />
          <SelectorSeparator
            label={(currentPath === '') ? 'Folder' :
                    `Folder: ${currentPath}`}
            list={foldersArr}
            selected={selectedFolderName}
            setSelected={selectFolder}
            data-testid='saveFolder'
          />
          <Selector
            label='File'
            list={filesArr}
            selected={selectedFileName}
            setSelected={setSelectedFileName}
            data-testid='openFile'
          />
      </Stack>
      <Button
        onClick={navigateToFile}
        disabled={selectedFileName === ''}
        variant='contained'
        data-testid='openFromGithub'
      >
        Open from Github
      </Button>
    </Stack>
  )
}

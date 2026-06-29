
import React, {ReactElement, useEffect, useState} from 'react'
import {Button, Stack, Typography} from '@mui/material'
import {navigateBaseOnModelPath} from '../../utils/location'
import {navigateToModel} from '../../utils/navigate'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {pathSuffixSupported} from '../../Filetype'
import {getFilesAndFolders} from '../../net/github/Files'
import {getOrganizations} from '../../net/github/Organizations'
import {getRepositories, getUserRepositories} from '../../net/github/Repositories'
import {getBranches} from '../../net/github/Branches'
import useStore from '../../store/useStore'
import {addRecentFileEntry, setPendingModelNameUpdate} from '../../connections/persistence'
import Selector from './Selector'
import SelectorSeparator from './SelectorSeparator'


/**
 * Resolve a value that may be a list index (number) or a direct string (from Other... mode).
 *
 * @param {number|string} value
 * @param {Array<string>} list
 * @return {string}
 */
function resolveValue(value, list) {
  return typeof value === 'string' ? value : list[value]
}


/**
 * @property {Function} navigate Callback from CadView to change page url
 * @property {Function} setIsDialogDisplayed callback
 * @property {Function} onCancel Called when user clicks Cancel to go back
 * @property {string}   [accessTokenOverride] When set, drives all GitHub
 *   API calls from this token instead of the legacy Auth0-federated
 *   token in zustand. Wired by OpenModelDialog when the new connection-
 *   based GitHub flow (githubAsSource feature flag) provides a token.
 * @property {object}   [activeConnection] The Connection driving the
 *   override token, used to tag recents with a connectionId so they
 *   land in the right card on the Sources tab.
 * @property {Function} [checkQuota] Optional async gate; receives sharePath, returns boolean (true = proceed)
 * @return {ReactElement}
 */
export default function GitHubFileBrowser({
  navigate,
  setIsDialogDisplayed,
  onCancel,
  accessTokenOverride,
  activeConnection,
  checkQuota,
}) {
  // Prefer the override (connection-derived token) over the legacy
  // Auth0-federated `useStore.accessToken`. Once the legacy path retires
  // (PR3+), the store-backed branch can go away.
  const storeToken = useStore((state) => state.accessToken)
  const accessToken = accessTokenOverride ?? storeToken
  const [orgNamesArr, setOrgNamesArr] = useState([''])
  const [currentPath, setCurrentPath] = useState('')
  const [foldersArr, setFoldersArr] = useState([''])
  const {user} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFolderName, setSelectedFolderName] = useState('')
  const [selectedFileIndex, setSelectedFileIndex] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const [branchesArr, setBranchesArr] = useState([''])
  const [selectedBranchName, setSelectedBranchName] = useState('')
  const orgNamesArrWithAt = orgNamesArr.map((name) => `@${name}`)
  const orgName = resolveValue(selectedOrgName, orgNamesArr)
  const repoName = resolveValue(selectedRepoName, repoNamesArr)
  const fileName = filesArr[selectedFileIndex]
  const branchName = resolveValue(selectedBranchName, branchesArr)

  // Lazy-fetch the user's GitHub organizations only when this browser is mounted
  // (i.e. user clicked Browse on the GitHub tab). Avoids spurious /user/orgs
  // calls when the Open dialog is opened on a non-GitHub tab.
  useEffect(() => {
    if (!accessToken) {
      return
    }
    let cancelled = false
    /** Asynchronously fetch organizations */
    async function fetchOrganizations() {
      const orgs = await getOrganizations(accessToken)
      if (cancelled) {
        return
      }
      const orgNamesFetched = Object.keys(orgs).map((key) => orgs[key].login)
      const orgNames = [...orgNamesFetched, user && user.nickname].filter(Boolean)
      setOrgNamesArr(orgNames.length > 0 ? orgNames : [''])
    }
    fetchOrganizations()
    return () => {
      cancelled = true
    }
  }, [accessToken, user])

  const selectOrg = async (orgOrIndex) => {
    setSelectedOrgName(orgOrIndex)
    const resolvedOrgName = resolveValue(orgOrIndex, orgNamesArr)
    let repos
    if (resolvedOrgName === user.nickname) {
      repos = await getUserRepositories(accessToken, resolvedOrgName)
    } else {
      repos = await getRepositories(resolvedOrgName, accessToken)
    }
    const repoNames = Object.keys(repos).map((key) => repos[key].name)
    setRepoNamesArr(repoNames)
    setCurrentPath('')
    setFoldersArr([''])
    setSelectedFolderName('')
    setSelectedFileIndex('')
    setSelectedRepoName('')
  }

  const selectRepo = async (repoOrIndex) => {
    setSelectedRepoName(repoOrIndex)
    const resolvedRepoName = resolveValue(repoOrIndex, repoNamesArr)
    const {files, directories} = await getFilesAndFolders(resolvedRepoName, orgName, '/', accessToken)
    const repository = {orgName, name: resolvedRepoName}
    const branches = await getBranches(repository, accessToken)
    const branchNames = branches.map((branch) => branch.name)
    setBranchesArr(branchNames)
    setSelectedBranchName(branchNames.length > 0 ? branchNames.indexOf('main') >= 0 ? branchNames.indexOf('main') : 0 : '')

    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)

    setFilesArr(fileNames)
    setFoldersArr([...directoryNames])
    setCurrentPath('')
    setSelectedFolderName('')
    setSelectedFileIndex('')
  }

  const selectFolder = async (folderIndex) => {
    const selectedFolderName_ = foldersArr[folderIndex]

    let newPath
    if (selectedFolderName_ === '[Parent Directory]') {
      const pathSegments = currentPath.split('/').filter(Boolean)
      pathSegments.pop()
      newPath = pathSegments.join('/')
    } else {
      newPath = selectedFolderName_ === '/' ? '' : `${currentPath}/${selectedFolderName_}`.replace('//', '/')
    }

    setSelectedFolderName('')
    setCurrentPath(newPath)

    const {files, directories} = await getFilesAndFolders(repoName, orgName, newPath, accessToken)
    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)

    const navigationOptions = newPath ? ['[Parent Directory]', ...directoryNames] : [...directoryNames]

    setFilesArr(fileNames)
    setFoldersArr(navigationOptions)
  }

  const selectBranch = (branchOrIndex) => {
    setSelectedBranchName(branchOrIndex)
  }

  const validateOrg = async (name) => {
    if (!name.trim()) {
      return false
    }
    try {
      if (name === user?.nickname) {
        await getUserRepositories(accessToken, name)
      } else {
        await getRepositories(name, accessToken)
      }
      return true
    } catch {
      return false
    }
  }

  const validateRepo = async (name) => {
    if (!name.trim() || !orgName) {
      return false
    }
    try {
      await getFilesAndFolders(name, orgName, '/', accessToken)
      return true
    } catch {
      return false
    }
  }

  const validateBranch = async (name) => {
    if (!name.trim() || !orgName || !repoName) {
      return false
    }
    try {
      const branches = await getBranches({orgName, name: repoName}, accessToken)
      return branches.some((b) => b.name === name)
    } catch {
      return false
    }
  }

  const navigateToFile = async () => {
    if (!pathSuffixSupported(fileName)) {
      return
    }
    const branch = branchName || 'main'
    const sharePath = navigateBaseOnModelPath(orgName, repoName, branch, `${currentPath}/${fileName}`)
    if (checkQuota) {
      const allowed = await checkQuota(sharePath)
      if (!allowed) {
        return
      }
    }
    navigateToModel({pathname: sharePath}, navigate)
    // Tag with connectionId when the connection-based path drove this
    // browse. Without it, GitHubTab can't filter recents to the card
    // they belong to (parity with how Drive recents are scoped).
    addRecentFileEntry({
      id: sharePath,
      source: 'github',
      name: fileName,
      sharePath,
      lastModifiedUtc: null,
      ...(activeConnection ? {connectionId: activeConnection.id} : {}),
    })
    setPendingModelNameUpdate(sharePath)
    setIsDialogDisplayed(false)
  }

  return (
    <Stack alignItems='center' data-testid='stack_gitHub_access_controls'>
      <Stack alignItems='center' sx={{width: '100%'}}>
        <Typography sx={{marginBottom: '10px'}}>Browse files on Github</Typography>
        <Selector
          label='Organization'
          list={orgNamesArrWithAt}
          selected={selectedOrgName}
          setSelected={selectOrg}
          validate={validateOrg}
          data-testid='openOrganization'
        />
        <Selector
          label='Repository'
          list={repoNamesArr}
          selected={selectedRepoName}
          setSelected={selectRepo}
          validate={validateRepo}
          data-testid='openRepository'
        />
        <Selector
          label='Branch'
          list={branchesArr}
          selected={selectedBranchName}
          setSelected={selectBranch}
          validate={validateBranch}
          data-testid='openBranch'
        />
        <SelectorSeparator
          label='Folder'
          list={foldersArr}
          selected={selectedFolderName}
          setSelected={selectFolder}
          displayValue={currentPath || undefined}
          emptyText='<No subfolders>'
          data-testid='saveFolder'
        />
        <Selector
          label='File'
          list={filesArr}
          selected={selectedFileIndex}
          setSelected={setSelectedFileIndex}
          data-testid='openFile'
        />
      </Stack>
      <Stack direction='row' spacing={1} sx={{mt: 1}}>
        <Button
          onClick={navigateToFile}
          disabled={selectedFileIndex === ''}
          variant='contained'
          color='accent'
          sx={{
            'textTransform': 'none',
            '&.Mui-disabled': {
              backgroundColor: 'accent.main',
              color: 'accent.contrastText',
              opacity: 0.5,
            },
          }}
          data-testid='button-openfromgithub'
        >
          Open
        </Button>
        <Button
          onClick={onCancel}
          variant='outlined'
          sx={{textTransform: 'none'}}
          data-testid='button-cancel-github'
        >
          Cancel
        </Button>
      </Stack>
    </Stack>
  )
}

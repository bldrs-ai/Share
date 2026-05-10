import React, {ReactElement, useState, useEffect, useMemo} from 'react'
import {useNavigate} from 'react-router-dom'
import {
  Box,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {Clear as ClearIcon, SaveOutlined as SaveOutlinedIcon} from '@mui/icons-material'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {writeSavedGithubModelOPFS} from '../../OPFS/utils'
import {commitFile, getFilesAndFolders} from '../../net/github/Files'
import {getOrganizations} from '../../net/github/Organizations'
import {getRepositories, getUserRepositories} from '../../net/github/Repositories'
import {getBranches} from '../../net/github/Branches'
import useStore from '../../store/useStore'
import {navigateBaseOnModelPath} from '../../utils/location'
import {navigateToModel} from '../../utils/navigate'
import {ControlButton} from '../Buttons'
import Dialog from '../Dialog'
import useExistInFeature from '../../hooks/useExistInFeature'
import PleaseLogin from './PleaseLogin'
import Selector from './Selector'
import SelectorSeparator from './SelectorSeparator'


/**
 * Displays model save dialog
 *
 * @return {ReactElement}
 */
export default function SaveModelControl() {
  const isSaveModelVisible = useStore((state) => state.isSaveModelVisible)
  const setIsSaveModelVisible = useStore((state) => state.setIsSaveModelVisible)

  const {user} = useAuth0()
  const navigate = useNavigate()
  const accessToken = useStore((state) => state.accessToken)
  const [orgNamesArr, setOrgNamesArray] = useState([''])


  useEffect(() => {
    /** @return {Array<string>} organizations */
    async function fetchOrganizations() {
      const orgs = await getOrganizations(accessToken)
      const orgNamesFetched = Object.keys(orgs).map((key) => orgs[key].login)
      const orgNames = [...orgNamesFetched, user && user.nickname]
      setOrgNamesArray(orgNames)
      return orgs
    }

    if (isSaveModelVisible && accessToken) {
      fetchOrganizations()
    }
  }, [isSaveModelVisible, accessToken, user])


  return (
    <ControlButton
      title={MSG_SAVE}
      isDialogDisplayed={isSaveModelVisible}
      setIsDialogDisplayed={setIsSaveModelVisible}
      icon={<SaveOutlinedIcon className='icon-share'/>}
      placement='bottom'
    >
      <SaveModelDialog
        isDialogDisplayed={isSaveModelVisible}
        setIsDialogDisplayed={setIsSaveModelVisible}
        navigate={navigate}
        orgNamesArr={orgNamesArr}
      />
    </ControlButton>
  )
}


/**
 * @property {boolean} isDialogDisplayed Is SaveModelDialog displayed
 * @property {Function} setIsDialogDisplayed Show SaveModelDialog
 * @property {Function} navigate Callback from CadView to change page url
 * @property {Array<string>} orgNamesArr The current user's GH orgs
 * @return {object} React component
 */
function SaveModelDialog({isDialogDisplayed, setIsDialogDisplayed, navigate, orgNamesArr}) {
  const {isAuthenticated, user} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')

  const [selectedFileName, setSelectedFileName] = useState('')

  const [createFolderName, setCreateFolderName] = useState('')
  const [requestCreateFolder, setRequestCreateFolder] = useState(false)
  const [selectedFolderName, setSelectedFolderName] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  // eslint-disable-next-line no-unused-vars
  const [filesArr, setFilesArr] = useState([''])
  const [foldersArr, setFoldersArr] = useState([''])
  const [branchesArr, setBranchesArr] = useState([''])
  const [selectedBranchName, setSelectedBranchName] = useState('')
  const [requestCreateBranch, setRequestCreateBranch] = useState(false)
  const [createBranchName, setCreateBranchName] = useState('')
  const [currentPath, setCurrentPath] = useState('')
  const accessToken = useStore((state) => state.accessToken)
  const isOpfsAvailable = useStore((state) => state.isOpfsAvailable)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]

  // Identity-decoupling PR2: surface the GitHub connection that will own
  // the commit. The actual save plumbing still uses the legacy Auth0-
  // federated `useStore.accessToken` (SOAP reverse-proxy rewrites the
  // bearer header anyway, so there's no point routing through a
  // connection-derived token until that path retires). For PR2 we
  // expose attribution + multi-account choice in UI; the plumbing swap
  // is PR3.
  const isGithubAsSourceOn = useExistInFeature('githubAsSource')
  const allConnections = useStore((state) => state.connections)
  const githubConnections = useMemo(
    () => allConnections.filter((c) => c.providerId === 'github'),
    [allConnections],
  )
  const [selectedGithubConnectionId, setSelectedGithubConnectionId] = useState('')
  // Default-select the first github connection when the dialog opens; if
  // the previously-selected connection got disconnected, fall back too.
  useEffect(() => {
    if (!isGithubAsSourceOn) {
      return
    }
    const stillExists = githubConnections.some((c) => c.id === selectedGithubConnectionId)
    if (!stillExists && githubConnections.length > 0) {
      setSelectedGithubConnectionId(githubConnections[0].id)
    } else if (githubConnections.length === 0 && selectedGithubConnectionId) {
      setSelectedGithubConnectionId('')
    }
  }, [isGithubAsSourceOn, githubConnections, selectedGithubConnectionId])
  const selectedGithubConnection = githubConnections.find(
    (c) => c.id === selectedGithubConnectionId,
  )
  const githubLogin = selectedGithubConnection?.meta?.login
  // Disable Save when the new flow is on AND the user has no github
  // connection — they can't possibly save anywhere. The legacy flow
  // (flag off) keeps its Auth0-federated path and stays clickable.
  const isSaveDisabled = isGithubAsSourceOn && githubConnections.length === 0
  const repoName = repoNamesArr[selectedRepoName]
  const file = useStore((state) => state.opfsFile)
  const setSnackMessage = useStore((state) => state.setSnackMessage)

  const saveFile = () => {
    if (file instanceof File) {
      let pathWithFileName = ''
      if (currentPath === '/') {
        if (createFolderName !== null && createFolderName !== '') {
          pathWithFileName = `${createFolderName }/${ selectedFileName}`
        } else {
          pathWithFileName = selectedFileName
        }
      } else if (createFolderName !== null && createFolderName !== '') {
        pathWithFileName = `${currentPath.substring(1, currentPath.length)
        }/${ createFolderName }/${ selectedFileName}`
      } else {
        pathWithFileName = `${currentPath.substring(1, currentPath.length)
        }/${ selectedFileName}`
      }

      const branchName = requestCreateBranch ? createBranchName : branchesArr[selectedBranchName] || 'main'
      fileSave(
        file,
        pathWithFileName,
        selectedFileName,
        orgName,
        repoName,
        branchName,
        accessToken,
        isOpfsAvailable,
        setSnackMessage,
        (pathname) => {
          navigateToModel({pathname}, navigate)
        },
      )
      // Store the branch name for subsequent saves
      if (requestCreateBranch) {
        // If it was a new branch, add it to the branches array and select it
        const newBranchesArr = [...branchesArr.slice(0, -2), branchName, {isSeparator: true}, MSG_CREATE_BRANCH]
        setBranchesArr(newBranchesArr)
        setSelectedBranchName(newBranchesArr.indexOf(branchName))
      }
      // Only hide the create branch text field, keep the branch selector visible
      setRequestCreateBranch(false)
      setIsDialogDisplayed(false)
    }
  }

  const selectOrg = async (org) => {
    setSelectedOrgName(org)
    let repos
    if (orgNamesArr[org] === user.nickname) {
      repos = await getUserRepositories(accessToken, orgNamesArr[org])
    } else {
      repos = await getRepositories(orgNamesArr[org], accessToken)
    }
    const repoNames = Object.keys(repos).map((key) => repos[key].name)
    setRepoNamesArr(repoNames)
    setFoldersArr(['/'])
    // setSelectedFolderName('test')
  }

  const selectRepo = async (repo) => {
    setSelectedRepoName(repo)
    // setSelectedFolderName(0); // This will set it to '/'
    const owner = orgNamesArr[selectedOrgName]
    const {files, directories} = await getFilesAndFolders(repoNamesArr[repo], owner, '/', accessToken)
    const repository = {orgName: owner, name: repoNamesArr[repo]}
    const branches = await getBranches(repository, accessToken)
    const branchNames = branches.map((branch) => branch.name)
    const branchesArrWithSeparator = [
      ...branchNames,
      {isSeparator: true},
      MSG_CREATE_BRANCH,
    ]
    setBranchesArr(branchesArrWithSeparator)
    setSelectedBranchName(branchNames.length > 0 ? 0 : '')
    setRequestCreateBranch(false)

    // eslint-disable-next-line no-shadow
    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)

    setFilesArr(fileNames)
    const foldersArrWithSeparator = [
      ...directoryNames, // All the folders
      {isSeparator: true}, // Separator item
      MSG_CREATE_FOLDER,
    ]

    setFoldersArr([...foldersArrWithSeparator])
    setCurrentPath('/')
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

      setRequestCreateFolder(false)
    } else if (selectedFolderName_ === MSG_CREATE_FOLDER) {
      newPath = currentPath
      setRequestCreateFolder(true)
    } else {
      // Navigate into a subfolder or stay at the root
      newPath = selectedFolderName_ === '/' ? '' : `${currentPath}/${selectedFolderName_}`.replace('//', '/')

      setRequestCreateFolder(false)
    }

    setSelectedFolderName('none')

    setCurrentPath(newPath)

    const {files, directories} = await getFilesAndFolders(repoName, owner, newPath, accessToken)
    // eslint-disable-next-line no-shadow
    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)

    // Adjust navigation options based on the current level
    const navigationOptions = newPath ? ['[Parent Directory]', ...directoryNames] : [...directoryNames]

    setFilesArr(fileNames)
    const foldersArrWithSeparator = [
      ...navigationOptions, // All the folders
      {isSeparator: true}, // Separator item
      MSG_CREATE_FOLDER,
    ]

    setFoldersArr(foldersArrWithSeparator)
  }

  const selectBranch = (branchIndex) => {
    const branchName_ = branchesArr[branchIndex]
    if (branchName_ === MSG_CREATE_BRANCH) {
      setRequestCreateBranch(true)
    } else {
      setSelectedBranchName(branchIndex)
      setRequestCreateBranch(false)
    }
  }

  return (
    <Dialog
      headerIcon={<SaveOutlinedIcon className='icon-share'/>}
      headerText={MSG_SAVE}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={MSG_SAVE_MODEL}
      actionCb={saveFile}
    >
      <Stack
        spacing={1}
        direction='column'
        justifyContent='center'
        alignItems='center'
      >
        {!isAuthenticated ? (
          <PleaseLogin/>
        ) : isSaveDisabled ? (
          <Stack
            spacing={2}
            sx={{width: '100%', alignItems: 'center', py: 2}}
            data-testid='save-needs-github-connection'
          >
            <Typography variant='body2' color='text.secondary' sx={{textAlign: 'center'}}>
              Connect GitHub in Sources to save.
            </Typography>
          </Stack>
        ) : (
          file instanceof File && (
            <Stack>
              <Typography variant='overline' sx={{marginBottom: '6px'}}>{MSG_PROJECTS}</Typography>
              <Selector
                label={MSG_ORGANIZATION}
                list={orgNamesArrWithAt}
                selected={selectedOrgName}
                setSelected={selectOrg}
                data-testid='saveOrganization'
              />
              <Selector
                label={MSG_REPOSITORY}
                list={repoNamesArr}
                selected={selectedRepoName}
                setSelected={selectRepo}
                data-testid='saveRepository'
              />
              <SelectorSeparator
                label={MSG_BRANCH}
                list={branchesArr}
                selected={selectedBranchName}
                setSelected={selectBranch}
                data-testid='saveBranch'
              />
              {requestCreateBranch && (
                <div style={{display: 'flex', alignItems: 'center', marginBottom: '.5em'}}>
                  <TextField
                    label={MSG_ENTER_BRANCH_NAME}
                    variant='outlined'
                    size='small'
                    onChange={(e) => setCreateBranchName(e.target.value)}
                    data-testid='CreateBranchId'
                    sx={{flexGrow: 1}}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                    }}
                  />
                  <IconButton
                    onClick={() => setRequestCreateBranch(false)}
                    size='small'
                  >
                    <ClearIcon className='icon-share'/>
                  </IconButton>
                </div>
              )}
              <SelectorSeparator
                label={currentPath === '' ? MSG_FOLDER : `${MSG_FOLDER}: ${currentPath}`}
                list={foldersArr}
                selected={selectedFolderName}
                setSelected={selectFolder}
                data-testid='saveFolder'
              />
              {requestCreateFolder && (
                <div style={{display: 'flex', alignItems: 'center', marginBottom: '.5em'}}>
                  <TextField
                    label={MSG_ENTER_FOLDER_NAME}
                    variant='outlined'
                    size='small'
                    onChange={(e) => setCreateFolderName(e.target.value)}
                    data-testid='CreateFolderId'
                    sx={{flexGrow: 1}}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                    }}
                  />
                  <IconButton
                    onClick={() => setRequestCreateFolder(false)}
                    size='small'
                  >
                    <ClearIcon className='icon-share'/>
                  </IconButton>
                </div>
              )}
              <TextField
                label={MSG_ENTER_FILE_NAME}
                variant='outlined'
                size='small'
                onChange={(e) => setSelectedFileName(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                sx={{marginBottom: '.5em'}}
                data-testid='CreateFileId'
              />
              {/*
                Multi-account picker — only shown when 2+ github connections
                exist on the new flow. With one connection there's nothing
                to pick; the footer below still surfaces the username.
              */}
              {isGithubAsSourceOn && githubConnections.length > 1 && (
                <Tooltip title={MSG_PICK_GITHUB_ACCOUNT_HELP} placement='top'>
                  <TextField
                    select
                    label={MSG_GITHUB_ACCOUNT}
                    variant='outlined'
                    size='small'
                    value={selectedGithubConnectionId}
                    onChange={(e) => setSelectedGithubConnectionId(e.target.value)}
                    sx={{marginBottom: '.5em'}}
                    data-testid='SaveGithubAccount'
                  >
                    {githubConnections.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.meta?.login ? `@${c.meta.login}` : c.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Tooltip>
              )}
              {/*
                "Saving as @{login}" footer — anchors commit attribution in
                the user's mental model. Hidden until the new flow is on
                AND a connection is selected so legacy users see no change.
              */}
              {isGithubAsSourceOn && githubLogin && (
                <Box
                  sx={{mt: 1, opacity: 0.7}}
                  data-testid='save-saving-as-footer'
                >
                  <Typography variant='caption' color='text.secondary'>
                    Saving as @{githubLogin}
                  </Typography>
                </Box>
              )}
            </Stack>
          )
        )}
      </Stack>
    </Dialog>
  )
}

// Tracks the active snack-clear timeout so successive saves don't
// pile up callbacks that could fire on an unmounted component.
let snackTimeoutId = null


/**
 * Schedule clearing of the snack message after a delay, replacing any
 * pending clear so only one is ever active.
 *
 * @param {Function} setSnackMessage
 * @param {number} pauseTimeMs
 */
function scheduleSnackClear(setSnackMessage, pauseTimeMs) {
  if (snackTimeoutId !== null) {
    clearTimeout(snackTimeoutId)
  }
  snackTimeoutId = setTimeout(() => {
    snackTimeoutId = null
    setSnackMessage(null)
  }, pauseTimeMs)
}


/**
 * Redirects to a new model after displaying a success message.
 * The function constructs a GitHub path for the committed file
 * and triggers a navigation to this path.
 *
 * @param {Function} onPathname - Callback function to handle pathname changes.
 * @param {string} orgName - The organization name on GitHub.
 * @param {string} repoName - The repository name on GitHub.
 * @param {string} branchName - The branch name on GitHub.
 * @param {string} pathWithFileName - The path including the file name on GitHub.
 * @param {Function} setSnackMessage - Function to set a snack message displayed to the user.
 */
function redirectToNewModel(onPathname, orgName, repoName, branchName, pathWithFileName, setSnackMessage) {
  setSnackMessage(MSG_SAVE_SUCCESS)
  const pauseTimeMs = 5000
  scheduleSnackClear(setSnackMessage, pauseTimeMs)

  const pathLeadingSlash = `/${ pathWithFileName}`

  // Redirect
  onPathname(navigateBaseOnModelPath(orgName, repoName, branchName, pathLeadingSlash))
}


/**
 * Asynchronously saves a file to GitHub and optionally to OPFS, then redirects.
 * The function handles the entire process of committing a file to
 * GitHub and managing UI feedback through snack messages.
 *
 * @param {File} file - The file to be saved.
 * @param {string} pathWithFileName - The full path including the file name.
 * @param {string} selectedFileName - The name of the file selected for save.
 * @param {string} orgName - The organization name on GitHub.
 * @param {string} repoName - The repository name on GitHub.
 * @param {string} branchName - The branch name on GitHub.
 * @param {string} accessToken - GitHub access token for authentication.
 * @param {boolean} opfsIsAvailable - Flag indicating if OPFS is available for use.
 * @param {Function} setSnackMessage - Function to set snack messages for the user.
 * @param {Function} onPathname - Callback function to handle pathname changes after successful save.
 */
async function fileSave(
  file,
  pathWithFileName,
  selectedFileName,
  orgName,
  repoName,
  branchName,
  accessToken,
  opfsIsAvailable,
  setSnackMessage,
  onPathname,
) {
  if (file instanceof File) {
    try {
      setSnackMessage(`Committing ${pathWithFileName} to GitHub...`)

      const commitHash = await commitFile(
        orgName,
        repoName,
        pathWithFileName,
        file,
        `Created file ${selectedFileName}`,
        branchName,
        accessToken)

      if (commitHash !== null) {
        // save to opfs
        if (opfsIsAvailable) {
          const opfsResult = await writeSavedGithubModelOPFS(file, pathWithFileName, commitHash, orgName, repoName, branchName)

          if (opfsResult) {
            redirectToNewModel(onPathname, orgName, repoName, branchName, pathWithFileName, setSnackMessage)
          } else {
            setSnackMessage(MSG_ERROR_OPFS)
            const pauseTimeMs = 5000
            scheduleSnackClear(setSnackMessage, pauseTimeMs)
          }
        } else {
          redirectToNewModel(onPathname, orgName, repoName, branchName, pathWithFileName, setSnackMessage)
        }
      } else {
        setSnackMessage(MSG_ERROR_GITHUB)
        const pauseTimeMs = 5000
        scheduleSnackClear(setSnackMessage, pauseTimeMs)
      }
    } catch (error) {
      setSnackMessage(error.message || MSG_ERROR_GITHUB)
      throw error // Re-throw to be caught by the Dialog's error handler
    }
  }
}


const MSG_BRANCH = 'Branch'
const MSG_CREATE_BRANCH = 'Create a branch'
const MSG_CREATE_FOLDER = 'Create a folder'
const MSG_ENTER_BRANCH_NAME = 'Enter branch name'
const MSG_ENTER_FOLDER_NAME = 'Enter folder name'
const MSG_ENTER_FILE_NAME = 'Enter file name'
const MSG_ERROR_GITHUB = 'Error: Could not commit to GitHub.'
const MSG_ERROR_OPFS = 'Error: Could not write file to OPFS.'
const MSG_FOLDER = 'Folder'
const MSG_GITHUB_ACCOUNT = 'GitHub account'
const MSG_ORGANIZATION = 'Organization'
const MSG_PICK_GITHUB_ACCOUNT_HELP = 'Pick which connected GitHub account this commit is attributed to'
const MSG_PROJECTS = 'Projects'
const MSG_SAVE = 'Save'
const MSG_SAVE_MODEL = 'Save model'
const MSG_SAVE_SUCCESS = 'Model saved successfully!'
const MSG_REPOSITORY = 'Repository'

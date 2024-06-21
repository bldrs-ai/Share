import React, {useState} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tabs from '../Tabs'
import TextField from '@mui/material/TextField'
import {writeSavedGithubModelOPFS} from '../../OPFS/utils'
import {commitFile, getFilesAndFolders} from '../../net/github/Files'
import {getRepositories, getUserRepositories} from '../../net/github/Repositories'
import useStore from '../../store/useStore'
import Dialog from '../Dialog'
import PleaseLogin from './PleaseLogin'
import Selector from './Selector'
import SelectorSeparator from './SelectorSeparator'
import ClearIcon from '@mui/icons-material/Clear'
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined'
import {navigateBaseOnModelPath} from '../../utils/location'


/**
 * @property {boolean} isDialogDisplayed Is SaveModelDialog displayed
 * @property {Function} setIsDialogDisplayed Show SaveModelDialog
 * @property {Function} navigate Callback from CadView to change page url
 * @property {Array<string>} orgNamesArr The current user's GH orgs
 * @return {object} React component
 */
export default function SaveModelDialog({isDialogDisplayed, setIsDialogDisplayed, navigate, orgNamesArr}) {
  const {isAuthenticated, user} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [createFolderName, setCreateFolderName] = useState('')
  const [requestCreateFolder, setRequestCreateFolder] = useState(false)
  const [selectedFolderName, setSelectedFolderName] = useState('')
  const [selectedFileIndex, setSelectedFileIndex] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  // eslint-disable-next-line no-unused-vars
  const [filesArr, setFilesArr] = useState([''])
  const [foldersArr, setFoldersArr] = useState([''])
  const [currentPath, setCurrentPath] = useState('')
  const accessToken = useStore((state) => state.accessToken)
  const isOpfsAvailable = useStore((state) => state.isOpfsAvailable)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const file = useStore((state) => state.opfsFile)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const tabLabels = ['Model', 'Version']
  const setCurrentTab = useStore((state) => state.setCurrentTab)
  const currentTab = useStore((state) => state.currentTab)

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

      fileSave(
          file,
          pathWithFileName,
          selectedFileName,
          orgName,
          repoName,
          // TODO(oleg): https://github.com/bldrs-ai/Share/issues/1215
          'main',
          accessToken,
          isOpfsAvailable,
          setSnackMessage,
          (pathname) => {
            navigate({pathname: pathname})
          },
      )
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

    // eslint-disable-next-line no-shadow
    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)

    setFilesArr(fileNames)
    const foldersArrWithSeparator = [
      ...directoryNames, // All the folders
      {isSeparator: true}, // Separator item
      'Create a folder',
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
    } else if (selectedFolderName_ === 'Create a folder') {
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
      'Create a folder',
    ]

    setFoldersArr(foldersArrWithSeparator)
  }

  return (
    <Dialog
      headerIcon={<SaveOutlinedIcon className='icon-share'/>}
      headerText='Save'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={currentTab === 0 ? 'Save model' : 'Save version'}
      actionCb={saveFile}
    >
      <Stack
        spacing={1}
        direction='column'
        justifyContent='center'
        alignItems='center'
      >
        {!isAuthenticated ?

        <PleaseLogin/> :
        <>
         <Tabs tabLabels={tabLabels} currentTab={currentTab} actionCb={(value) => setCurrentTab(value)} isScrollable={false}/>
         <Stack sx={{padding: '1em 0em', maxWidth: '18.5em'}}>
           <Selector label='Organization' list={orgNamesArrWithAt} selected={selectedOrgName} setSelected={selectOrg}
           data-testid='saveOrganization'
           />
           <Selector
             label='Repository'
             list={repoNamesArr}
             selected={selectedRepoName}
             setSelected={selectRepo}
             data-testid='saveRepository'
           />
           <SelectorSeparator
             label={(currentPath === '') ? 'Folder' :
                    `Folder: ${currentPath}`}
             list={foldersArr}
             selected={selectedFolderName}
             setSelected={selectFolder}
             data-testid='saveFolder'
           />
           {requestCreateFolder && (
             <div style={{display: 'flex', alignItems: 'center', marginBottom: '.5em'}}>
               <TextField
                 label='Enter folder name'
                 variant='outlined'
                 size='small'
                 onChange={(e) => setCreateFolderName(e.target.value)}
                 data-testid='CreateFolderId'
                 sx={{flexGrow: 1}}
                 onKeyDown={(e) => {
                   // Stops the event from propagating up to parent elements
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
          { currentTab === 0 &&
            <TextField
              label='Enter file name'
              variant='outlined'
              size='small'
              onChange={(e) => setSelectedFileName(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              sx={{marginBottom: '.5em'}}
              data-testid='CreateFileId'
            />
          }
          { currentTab === 1 &&
            <Selector
              label='File'
              list={filesArr}
              selected={selectedFileIndex}
              setSelected={setSelectedFileIndex}
              data-testid='openFile'
            />
          }
         </Stack>
        </>
        }
      </Stack>
    </Dialog>
  )
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
  setSnackMessage('Model saved successfully!')
  const pauseTimeMs = 5000
  setTimeout(() => setSnackMessage(null), pauseTimeMs)

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
    setSnackMessage(`Committing ${pathWithFileName} to GitHub...`)

    const commitHash = await commitFile(
        orgName,
        repoName,
        pathWithFileName,
        file,
        `Created file ${selectedFileName}`,
        'main',
        accessToken)

    if (commitHash !== null) {
      // save to opfs
      if (opfsIsAvailable) {
       const opfsResult = await writeSavedGithubModelOPFS(file, pathWithFileName, commitHash, orgName, repoName, branchName)

      if (opfsResult) {
        redirectToNewModel(onPathname, orgName, repoName, branchName, pathWithFileName, setSnackMessage)
      } else {
        setSnackMessage('Error: Could not write file to OPFS.')
        const pauseTimeMs = 5000
        setTimeout(() => setSnackMessage(null), pauseTimeMs)
      }
    } else {
      redirectToNewModel(onPathname, orgName, repoName, branchName, pathWithFileName, setSnackMessage)
    }
    } else {
      setSnackMessage('Error: Could not commit to GitHub.')
      const pauseTimeMs = 5000
      setTimeout(() => setSnackMessage(null), pauseTimeMs)
    }
  }
}

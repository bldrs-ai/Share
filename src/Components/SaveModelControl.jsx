import React, {useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {useAuth0} from '@auth0/auth0-react'
import Dialog from './Dialog'
import {TooltipIconButton} from './Buttons'
import Selector from './Selector'
import SelectorSeparator from './SelectorSeparator'
import useStore from '../store/useStore'
import {getOrganizations, getRepositories, getUserRepositories, getFilesAndFolders} from '../utils/GitHub'
import {RectangularButton} from '../Components/Buttons'
import UploadIcon from '../assets/icons/Upload.svg'
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolderOutlined'
import SaveHeaderIcon from '../assets/icons/SaveGraphic.svg'
import SaveIcon from '@mui/icons-material/Save'
import IconButton from '@mui/material/IconButton'
import ClearIcon from '@mui/icons-material/Clear'


/**
 * Displays model open dialog.
 *
 * @return {React.ReactElement}
 */
export default function SaveModelControl({fileOpen}) {
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
    <Box sx={{marginRight: '6px'}}>
      <TooltipIconButton
        title={'Save IFC'}
        onClick={() => setIsDialogDisplayed(true)}
        icon={<SaveIcon className='icon-share' color='secondary'/>}
        placement={'bottom'}
        selected={isDialogDisplayed}
        dataTestId='save-ifc'
      />
      {isDialogDisplayed &&
        <SaveModelDialog
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
function SaveModelDialog({isDialogDisplayed, setIsDialogDisplayed, fileSave, orgNamesArr}) {
  const {isAuthenticated, user} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  // eslint-disable-next-line no-unused-vars
  const [selectedFileName, setSelectedFileName] = useState('')
  // eslint-disable-next-line no-unused-vars
  const [createFolderName, setCreateFolderName] = useState('')
  const [requestCreateFolder, setRequestCreateFolder] = useState(false)
  const [selectedFolderName, setSelectedFolderName] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const [foldersArr, setFoldersArr] = useState([''])
  const [currentPath, setCurrentPath] = useState('')
  const navigate = useNavigate()
  const accessToken = useStore((state) => state.accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const fileName = filesArr[selectedFileName]

  const saveFile = () => {
    fileSave()
    setIsDialogDisplayed(false)
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
    setFoldersArr(['/'])
    // setSelectedFolderName('test')
  }

  const selectRepo = async (repo) => {
    setSelectedRepoName(repo)
    // setSelectedFolderName(0); // This will set it to '/'
    const owner = orgNamesArr[selectedOrgName]
    const {files, directories} = await getFilesAndFolders(repoNamesArr[repo], owner, '/', accessToken)

    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)

    setFilesArr(fileNames)
    const foldersArrWithSeparator = [
      ...directoryNames, // All the folders
      {isSeparator: true}, // Separator item
      'Create a folder',
    ]

    setFoldersArr([...foldersArrWithSeparator])
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

  const navigateToFile = () => {
    if (filesArr[selectedFileName].includes('.ifc')) {
      navigate({pathname: `/share/v/gh/${orgName}/${repoName}/main/${fileName}`})
    }
  }

  return (
    <Dialog
      icon={<CreateNewFolderIcon className='icon-share'/>}
      headerText={'Save'}
      headerIcon={<SaveHeaderIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'Save File'}
      actionIcon={<UploadIcon className='icon-share'/>}
      actionCb={saveFile}
      content={
        <Stack
          spacing={1}
          direction="column"
          justifyContent="center"
          alignItems="center"
          sx={{paddingTop: '6px', width: '280px'}}
        >
          {isAuthenticated ?
          <Stack>
            <Typography variant='overline' sx={{marginBottom: '6px'}}>Projects</Typography>
            <Selector label={'Organization'} list={orgNamesArrWithAt} selected={selectedOrgName} setSelected={selectOrg}/>
            <Selector label={'Repository'} list={repoNamesArr} selected={selectedRepoName} setSelected={selectRepo} testId={'Repository'}/>
            <SelectorSeparator label={(currentPath === '') ? 'Folder' :
            `Folder: ${ currentPath}`} list={foldersArr} selected={selectedFolderName}
            setSelected={selectFolder} testId={'Folder'}
            />
            {requestCreateFolder && (
              <div style={{display: 'flex', alignItems: 'center', marginBottom: '.5em'}}>
                <TextField
                  label="Enter folder name"
                  variant='outlined'
                  size='small'
                  onChange={(e) => setCreateFolderName(e.target.value)}
                  data-testid="CreateFolderId"
                  sx={{flexGrow: 1}}
                />
                <IconButton
                  onClick={() => setRequestCreateFolder(false)}
                  size="small"
                >
                  <ClearIcon/>
                </IconButton>
              </div>
            )}
            <TextField
              sx={{
                marginBottom: '.5em',
              }}
              label="Enter file name"
              variant='outlined'
              size='small'
              onChange={(e) => setCreateFolderName(e.target.value)}
              data-testid="CreateFileId"
            />
            {selectedFileName !== '' &&
              <Box sx={{textAlign: 'center', marginTop: '4px'}}>
                <RectangularButton
                  title={'SAVE FILE'}
                  onClick={navigateToFile}
                />
              </Box>
            }
          </Stack> :
          <Box sx={{padding: '0px 10px'}} elevation={0}>
            <Stack sx={{textAlign: 'left'}}>
              <Typography variant={'body1'} sx={{marginTop: '10px'}}>
                Please login to GitHub to get access to your projects.
                Visit our {' '}
                <Link href='https://github.com/bldrs-ai/Share/wiki/GitHub-model-hosting' color='inherit' variant='body1'>
                  wiki
                </Link> to learn more about GitHub hosting.
              </Typography>
              <Typography variant={'caption'} sx={{marginTop: '10px'}}>
               * Local files cannot yet be saved or shared.
              </Typography>
            </Stack>
          </Box>
          }
        </Stack>
      }
    />
  )
}

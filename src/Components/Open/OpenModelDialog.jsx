import React, {ReactElement, useState} from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {checkOPFSAvailability} from '../../OPFS/utils'
import {getFiles} from '../../net/github/Files'
import useStore from '../../store/useStore'
import {getRepositories, getUserRepositories} from '../../net/github/Repositories'
import {handleBeforeUnload} from '../../utils/event'
import {loadLocalFile, loadLocalFileFallback} from '../../utils/loader'
import Dialog from '../Dialog'
import PleaseLogin from './PleaseLogin'
import SampleModelFileSelector from './SampleModelFileSelector'
import Selector from './Selector'
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolderOutlined'


/**
 * @property {boolean} isDialogDisplayed Passed to dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to dialog to be controlled
 * @property {Function} navigate Callback from CadView to change page url
 * @property {Array<string>} orgNamesArr List of org names for the current user.
 * @return {ReactElement}
 */
export default function OpenModelDialog({
  isDialogDisplayed,
  setIsDialogDisplayed,
  navigate,
  orgNamesArr,
}) {
  const {isAuthenticated, user} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const accessToken = useStore((state) => state.accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const fileName = filesArr[selectedFileName]
  const appPrefix = useStore((state) => state.appPrefix)
  const isOpfsAvailable = checkOPFSAvailability()

  const openFile = () => {
    if (isOpfsAvailable) {
      loadLocalFile(navigate, appPrefix, handleBeforeUnload, false)
    } else {
      loadLocalFileFallback(navigate, appPrefix, handleBeforeUnload, false)
    }
    setIsDialogDisplayed(false)
  }

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
  }

  const selectRepo = async (repo) => {
    setSelectedRepoName(repo)
    const owner = orgNamesArr[selectedOrgName]
    const files = await getFiles(owner, repoNamesArr[repo], accessToken)
    const fileNames = Object.keys(files).map((key) => files[key].name)
    setFilesArr(fileNames)
  }

  const navigateToFile = () => {
    setIsDialogDisplayed(false)
    if (filesArr[selectedFileName].includes('.ifc')) {
      navigate({pathname: `/share/v/gh/${orgName}/${repoName}/main/${fileName}`})
    }
  }

  return (
    <Dialog
      headerIcon={<CreateNewFolderIcon className='icon-share'/>}
      headerText='Open'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle='Open model'
      actionCb={openFile}
    >
      <Stack
        spacing={1}
        direction='column'
        justifyContent='center'
        alignItems='center'
      >
        <>
          <Typography
            variant='overline'
            sx={{marginBottom: '6px'}}
          >
            Browse sample models
          </Typography>
          <SampleModelFileSelector
            navigate={navigate}
            setIsDialogDisplayed={setIsDialogDisplayed}
          />
        </>
        {!isAuthenticated ?

         <PleaseLogin/> :

         <Stack alignItems='center'>
           <Typography
             variant='overline'
             sx={{marginBottom: '6px'}}
           >
             Browse your GitHub projects
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
           <Selector
             label='File'
             list={filesArr}
             selected={selectedFileName}
             setSelected={setSelectedFileName}
             data-testid='openFile'
           />
           {selectedFileName !== '' &&
            <Box sx={{textAlign: 'center', marginTop: '4px'}}>
              <Button onClick={navigateToFile}>
                Load file
              </Button>
            </Box>
           }
         </Stack>
        }
        <Typography
          variant='overline'
          sx={{marginBottom: '6px'}}
        >
          Open local model
        </Typography>
      </Stack>
    </Dialog>
  )
}

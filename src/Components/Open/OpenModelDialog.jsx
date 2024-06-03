import React, {ReactElement} from 'react'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import GitHubFileBrowser from './GitHubFileBrowser'
import PleaseLogin from './PleaseLogin'
import SampleModels from './SampleModels'
import Dialog from '../Dialog'
import Tabs from '../Tabs'
import useStore from '../../store/useStore'
import {checkOPFSAvailability} from '../../OPFS/utils'
import {handleBeforeUnload} from '../../utils/event'
import {loadLocalFile, loadLocalFileFallback} from '../../utils/loader'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {useIsMobile} from '../Hooks'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'


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
  const tabLabels = ['Project', 'Samples']
  const {isAuthenticated, user} = useAuth0()
  const appPrefix = useStore((state) => state.appPrefix)
  const setCurrentTab = useStore((state) => state.setCurrentTab)
  const currentTab = useStore((state) => state.currentTab)
  const isOpfsAvailable = checkOPFSAvailability()
  const isMobile = useIsMobile()


  const openFile = () => {
    if (isOpfsAvailable) {
      loadLocalFile(navigate, appPrefix, handleBeforeUnload, false)
    } else {
      loadLocalFileFallback(navigate, appPrefix, handleBeforeUnload, false)
    }
    setIsDialogDisplayed(false)
  }

  return (
    <Dialog
      headerIcon={<FolderOpenIcon className='icon-share'/>}
      headerText='Open'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
    >
      <Tabs tabLabels={tabLabels} currentTab={currentTab} actionCb={(value) => setCurrentTab(value)} isScrollable={false}/>
      { currentTab === 1 &&
        <Stack
          justifyContent='center'
          sx={{marginTop: '1em', paddingBottom: '1em', width: '17.5em'}}
        >
          <SampleModels
            navigate={navigate}
            setIsDialogDisplayed={setIsDialogDisplayed}
          />
        </Stack> }
      { currentTab === 0 &&
        <Stack
          spacing={1}
          direction='column'
          justifyContent='center'
          alignItems='center'
          sx={{marginTop: '.5em', paddingBottom: '1em', width: '17.5em'}}
        >
          <Stack spacing={1} sx={{marginTop: '.5em', width: '92%'}}>
            <Button onClick={openFile} variant='contained' data-testid={'button_open_file'}>
              Open File
            </Button>
          {!isMobile && <Typography variant='caption'> Files can be opened by dragging and dropping them into the viewport</Typography>}
          {isAuthenticated && !isMobile && <Divider sx={{paddingBottom: '.2em'}}/>}
          {isAuthenticated && isMobile && <Divider sx={{paddingTop: '.5em'}}/>}
          </Stack>
          {isAuthenticated &&
          <GitHubFileBrowser navigate={navigate} orgNamesArr={orgNamesArr} user={user} setIsDialogDisplayed={setIsDialogDisplayed}/>}
          {!isAuthenticated && <Box sx={{width: '92%', textAlign: 'left'}}><PleaseLogin/></Box>}
        </Stack>
      }
    </Dialog>
  )
}

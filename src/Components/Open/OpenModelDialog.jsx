import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {checkOPFSAvailability} from '../../OPFS/utils'
import useStore from '../../store/useStore'
import {handleBeforeUnload} from '../../utils/event'
import {loadLocalFile, loadLocalFileFallback} from '../../utils/loader'
import SearchBar from '../Search/SearchBar'
import Dialog from '../Dialog'
import {useIsMobile} from '../Hooks'
import Tabs from '../Tabs'
import GitHubFileBrowser from './GitHubFileBrowser'
import PleaseLogin from './PleaseLogin'
import SampleModels from './SampleModels'
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
  const tabLabels = ['Local', 'Github', 'Samples']
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
        <Stack
          spacing={1}
          direction='column'
          justifyContent='center'
          alignItems='center'
          sx={{padding: '1em 0em', maxWidth: '18.5em'}}
        >
        { currentTab === 0 &&
          <Stack spacing={1} sx={{width: '92%'}}>
            <Button onClick={openFile} variant='contained' data-testid={'button_open_file'}>
              Browse files...
            </Button>
            {!isMobile && <Typography variant='caption'> Files can be opened by dragging and dropping them into the viewport</Typography>}
          </Stack>
        }
        { currentTab === 1 &&
          <>
            <SearchBar placeholder='Model URL'/>
            {isAuthenticated &&
            <GitHubFileBrowser navigate={navigate} orgNamesArr={orgNamesArr} user={user} setIsDialogDisplayed={setIsDialogDisplayed}/>}
            {!isAuthenticated && <Box sx={{width: '94%', textAlign: 'left'}}><PleaseLogin/></Box>}
          </>
        }
        { currentTab === 2 &&
          <SampleModels
          navigate={navigate}
          setIsDialogDisplayed={setIsDialogDisplayed}
          />
        }
        </Stack>
    </Dialog>
  )
}

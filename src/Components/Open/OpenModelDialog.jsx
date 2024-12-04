import React, {ReactElement} from 'react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {checkOPFSAvailability} from '../../OPFS/utils'
import {looksLikeLink, githubUrlOrPathToSharePath} from '../../net/github/utils'
import useStore from '../../store/useStore'
import {loadLocalFile, loadLocalFileFallback} from '../../utils/loader'
import {disablePageReloadApprovalCheck} from '../../utils/event'
import Dialog from '../Dialog'
import {useIsMobile} from '../Hooks'
import Tabs from '../Tabs'
import GitHubFileBrowser from './GitHubFileBrowser'
import PleaseLogin from './PleaseLogin'
import SampleModels from './SampleModels'
import {LABEL_LOCAL, LABEL_GITHUB, LABEL_SAMPLES} from './component'
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
  const tabLabels = [LABEL_LOCAL, LABEL_GITHUB, LABEL_SAMPLES]
  const {isAuthenticated, user} = useAuth0()
  const appPrefix = useStore((state) => state.appPrefix)
  const setCurrentTab = useStore((state) => state.setCurrentTab)
  const currentTab = useStore((state) => state.currentTab)
  const isOpfsAvailable = checkOPFSAvailability()
  const isMobile = useIsMobile()


  const openFile = () => {
    const onLoad = (filename) => {
      disablePageReloadApprovalCheck()
      navigate(`${appPrefix}/v/new/${filename}`)
    }
    if (isOpfsAvailable) {
      loadLocalFile(onLoad, false)
    } else {
      loadLocalFileFallback(onLoad, false)
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
            {!isMobile &&
              <Typography
                variant='caption'
              >
                Drag and Drop files into viewport to open
              </Typography>}
          </Stack>
        }
        { currentTab === 1 &&
          <>
            <TextField
              label="GitHub Model URL"
              value={name}
              onChange={(event) => {
                const ghPath = event.target.value
                if (looksLikeLink(ghPath)) {
                  setIsDialogDisplayed(false)
                  navigate(githubUrlOrPathToSharePath(ghPath))
                }
              }}
            />
            {isAuthenticated &&
             <GitHubFileBrowser
               navigate={navigate}
               orgNamesArr={orgNamesArr}
               user={user}
               setIsDialogDisplayed={setIsDialogDisplayed}
             />}
            {!isAuthenticated && <PleaseLogin/>}
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

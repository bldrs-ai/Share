import React, {ReactElement} from 'react'
import {Button, Stack, Typography, TextField} from '@mui/material'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {checkOPFSAvailability} from '../../OPFS/utils'
import {looksLikeLink, githubUrlOrPathToSharePath} from '../../net/github/utils'
import useStore from '../../store/useStore'
import {loadLocalFile, loadLocalFileFallback} from '../../utils/loader'
import {disablePageReloadApprovalCheck} from '../../utils/event'
import {navigateToModel} from '../../utils/navigate'
import Dialog from '../Dialog'
import {useIsMobile} from '../Hooks'
import Tabs from '../Tabs'
import GitHubFileBrowser from './GitHubFileBrowser'
import PleaseLogin from './PleaseLogin'
import LocalModels from './LocalModels'
import RecentModels from './RecentModels'
import SampleModels from './SampleModels'
import {LABEL_LOCAL, LABEL_RECENT, LABEL_GITHUB, LABEL_SAMPLES} from './component'

import {FolderOpen as FolderOpenIcon} from 'lucide-react'
const LABEL_TEST_MODELS = 'Test Models'


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
  const tabLabels = [LABEL_LOCAL, LABEL_RECENT, LABEL_TEST_MODELS, LABEL_GITHUB, LABEL_SAMPLES]
  const {isAuthenticated, user} = useAuth0()
  const appPrefix = useStore((state) => state.appPrefix)
  const setCurrentTab = useStore((state) => state.setCurrentTab)
  const currentTab = useStore((state) => state.currentTab)
  const isOpfsAvailable = checkOPFSAvailability()
  const isMobile = useIsMobile()


  const openFile = () => {
    const onLoad = (filename) => {
      // Use full reload when opening a new local file
      disablePageReloadApprovalCheck()
      navigateToModel(`${appPrefix}/v/new/${filename}`, navigate)
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
      headerIcon={<FolderOpenIcon size={18} strokeWidth={1.75}/>}
      headerText='Open'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
    >
      <Tabs
        tabLabels={tabLabels}
        currentTab={currentTab}
        actionCb={(value) => setCurrentTab(value)}
        isScrollable={true}
      />
      <Stack
        spacing={1}
        direction='column'
        sx={{
          mt: 2,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        data-testid={`dialog-open-model-tabs-stack`}
      >
        { currentTab === 0 &&
          <Stack data-testid='dialog-open-model-local' spacing={1} sx={{alignItems: 'center', py: 2}}>
            <Typography variant='body2' sx={{fontSize: '12px', opacity: 0.5}}>
              Drag and drop files into viewport, or
            </Typography>
            <Button
              onClick={openFile}
              variant='outlined'
              size='small'
              sx={{textTransform: 'none', fontSize: '13px'}}
              data-testid='button_open_file'
            >
              Browse files...
            </Button>
          </Stack>
        }
        { currentTab === 1 &&
          <RecentModels
            navigate={navigate}
            setIsDialogDisplayed={setIsDialogDisplayed}
          />
        }
        { currentTab === 2 &&
          <LocalModels
            navigate={navigate}
            setIsDialogDisplayed={setIsDialogDisplayed}
          />
        }
        { currentTab === 3 &&
          <Stack data-testid={`dialog-open-model-github`} spacing={1}>
            <TextField
              label='GitHub Model URL'
              value={name}
              onChange={(event) => {
                const ghPath = event.target.value
                if (looksLikeLink(ghPath)) {
                  setIsDialogDisplayed(false)
                  navigateToModel(githubUrlOrPathToSharePath(ghPath), navigate)
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
          </Stack>
        }
        { currentTab === 4 &&
          <SampleModels
            navigate={navigate}
            setIsDialogDisplayed={setIsDialogDisplayed}
          />
        }
      </Stack>
    </Dialog>
  )
}

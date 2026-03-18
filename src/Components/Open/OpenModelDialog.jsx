import React, {ReactElement, useState} from 'react'
import {Button, Stack, Typography, TextField} from '@mui/material'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {checkOPFSAvailability} from '../../OPFS/utils'
import {looksLikeLink, githubUrlOrPathToSharePath} from '../../net/github/utils'
import useStore from '../../store/useStore'
import {loadLocalFile, loadLocalFileFallback} from '../../utils/loader'
import {loadFileById} from '../../connections/loadFromSource'
import {disablePageReloadApprovalCheck} from '../../utils/event'
import {navigateToModel} from '../../utils/navigate'
import Dialog from '../Dialog'
import {useIsMobile} from '../Hooks'
import Tabs from '../Tabs'
import GitHubFileBrowser from './GitHubFileBrowser'
import PleaseLogin from './PleaseLogin'
import SampleModels from './SampleModels'
import SourcesTab from '../Connections/SourcesTab'
import GoogleDrivePickerDialog from '../Connections/GoogleDrivePickerDialog'
import {LABEL_LOCAL, LABEL_GITHUB, LABEL_SOURCES, LABEL_SAMPLES} from './component'
import {FolderOpen as FolderOpenIcon} from '@mui/icons-material'


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
  const tabLabels = [LABEL_LOCAL, LABEL_GITHUB, LABEL_SOURCES, LABEL_SAMPLES]
  const {isAuthenticated, user} = useAuth0()
  const appPrefix = useStore((state) => state.appPrefix)
  const setCurrentTab = useStore((state) => state.setCurrentTab)
  const currentTab = useStore((state) => state.currentTab)
  const isOpfsAvailable = checkOPFSAvailability()
  const isMobile = useIsMobile()

  const [pickerToken, setPickerToken] = useState(null)
  const [pickerConnection, setPickerConnection] = useState(null)

  const handlePickerReady = (token, connection) => {
    setIsDialogDisplayed(false)
    setPickerToken(token)
    setPickerConnection(connection)
  }

  const handlePickerSelect = async (docs) => {
    if (!pickerConnection || !docs || docs.length === 0) {
      return
    }
    const doc = docs[0]
    const connection = pickerConnection
    setPickerToken(null)
    setPickerConnection(null)
    try {
      await loadFileById(connection, doc.id, doc.name, (filename) => {
        disablePageReloadApprovalCheck()
        navigateToModel(`${appPrefix}/v/new/${filename}`, navigate)
      })
    } catch (err) {
      console.error('Failed to open file from Google Drive:', err)
    }
  }

  const handlePickerCancel = () => {
    setPickerToken(null)
    setPickerConnection(null)
  }

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
    <>
      <Dialog
        headerIcon={<FolderOpenIcon className='icon-share'/>}
        headerText='Open'
        isDialogDisplayed={isDialogDisplayed}
        setIsDialogDisplayed={setIsDialogDisplayed}
      >
        <Tabs
          tabLabels={tabLabels}
          currentTab={currentTab}
          actionCb={(value) => setCurrentTab(value)}
          isScrollable={false}
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
          <Stack data-testid='dialog-open-model-local' spacing={1}>
            {!isMobile &&
                <>
                  <Typography
                    variant='caption'
                  >
                    Drag and Drop files into viewport to open
                  </Typography>
                  <Typography
                    variant='caption'
                    sx={{textAlign: 'center', color: 'text.secondary'}}
                  >
                    — or —
                  </Typography>
                </>
            }
            <Button onClick={openFile} variant='contained' data-testid='button_open_file'>
               Browse files...
            </Button>
          </Stack>
          }
          { currentTab === 1 &&
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
          { currentTab === 2 &&
          <SourcesTab
            onPickerReady={handlePickerReady}
          />
          }
          { currentTab === 3 &&
          <SampleModels
            navigate={navigate}
            setIsDialogDisplayed={setIsDialogDisplayed}
          />
          }
        </Stack>
      </Dialog>

      <GoogleDrivePickerDialog
        accessToken={pickerToken}
        isOpen={pickerConnection !== null}
        mode='file'
        onSelect={handlePickerSelect}
        onCancel={handlePickerCancel}
      />
    </>
  )
}

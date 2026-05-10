import React, {ReactElement, useEffect, useState} from 'react'
import {Box, Button, Divider, Slide, Stack, Typography} from '@mui/material'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {checkOPFSAvailability} from '../../OPFS/utils'
import useStore from '../../store/useStore'
import {loadLocalFile, loadLocalFileFallback} from '../../utils/loader'
import {NeedsReconnectError} from '../../connections/errors'
import {
  addRecentFileEntry,
  loadRecentFilesBySource,
  setPendingModelNameUpdate,
} from '../../connections/persistence'
import {getProvider} from '../../connections/registry'
import {disablePageReloadApprovalCheck} from '../../utils/event'
import {navigateToModel} from '../../utils/navigate'
import Dialog from '../Dialog'
import {useIsMobile} from '../Hooks'
import useExistInFeature from '../../hooks/useExistInFeature'
import Tabs from '../Tabs'
import {useMock} from '../Profile/ProfileControl'
import GitHubFileBrowser from './GitHubFileBrowser'
import SampleModels from './SampleModels'
import AccountFooter from '../Connections/AccountFooter'
import GoogleDriveTab from '../Connections/GoogleDriveTab'
import GitHubTab from '../Connections/GitHubTab'
import GoogleDrivePickerDialog from '../Connections/GoogleDrivePickerDialog'
import RecentFilesBrowseSection from '../Connections/RecentFilesBrowseSection'
import {LABEL_LOCAL, LABEL_GITHUB, LABEL_GOOGLE, LABEL_SAMPLES} from './component'
import {FolderOpen as FolderOpenIcon, GitHub as GitHubIcon} from '@mui/icons-material'


/**
 * @property {boolean} isDialogDisplayed Passed to dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to dialog to be controlled
 * @property {Function} navigate Callback from CadView to change page url
 * @return {ReactElement}
 */
export default function OpenModelDialog({
  isDialogDisplayed,
  setIsDialogDisplayed,
  navigate,
}) {
  const isGoogleDriveEnabled = useExistInFeature('googleDrive')
  const isGithubAsSourceOn = useExistInFeature('githubAsSource')
  const tabLabels = isGoogleDriveEnabled ?
    [LABEL_LOCAL, LABEL_GOOGLE, LABEL_GITHUB, LABEL_SAMPLES] :
    [LABEL_LOCAL, LABEL_GITHUB, LABEL_SAMPLES]
  const {isAuthenticated, loginWithRedirect, logout, user} = useAuth0()
  const appPrefix = useStore((state) => state.appPrefix)
  const setCurrentTab = useStore((state) => state.setCurrentTab)
  const currentTab = useStore((state) => state.currentTab)
  const isOpfsAvailable = checkOPFSAvailability()
  const isMobile = useIsMobile()

  const [pickerToken, setPickerToken] = useState(null)
  const [pickerConnection, setPickerConnection] = useState(null)
  const [localRecents, setLocalRecents] = useState([])
  const [githubRecents, setGithubRecents] = useState([])
  const [showGithubBrowser, setShowGithubBrowser] = useState(false)

  useEffect(() => {
    if (isDialogDisplayed) {
      setLocalRecents(loadRecentFilesBySource('local'))
      setGithubRecents(loadRecentFilesBySource('github'))
      setShowGithubBrowser(false)
    }
  }, [isDialogDisplayed])

  const handlePickerReady = (token, connection) => {
    setIsDialogDisplayed(false)
    setPickerToken(token)
    setPickerConnection(connection)
  }

  const setAlert = useStore((state) => state.setAlert)

  const handleOpenById = async (connection, fileId, fileName) => {
    // Pre-flight token acquisition INSIDE this user-gesture click handler so
    // that if GIS needs to pop a consent window, the popup inherits the click
    // activation and the browser allows it. If we navigate first, the gesture
    // is gone by the time CadView's load chain calls getAccessToken — and a
    // stale token there hits popup_failed_to_open and bricks the load.
    const provider = getProvider(connection.providerId)
    if (provider) {
      try {
        await provider.getAccessToken(connection)
      } catch (err) {
        if (err instanceof NeedsReconnectError) {
          setAlert({
            type: 'needsReconnect',
            connection: err.connection,
            message: 'Your Google Drive session needs to be reconnected to open this file.',
          })
          return
        }
        setAlert(err)
        return
      }
    }
    disablePageReloadApprovalCheck()
    addRecentFileEntry({
      id: fileId,
      source: 'google-drive',
      name: fileName,
      mimeType: '',
      lastModifiedUtc: null,
      connectionId: connection.id,
      fileId,
      sharePath: `${appPrefix}/v/g/${fileId}`,
    })
    navigateToModel(`${appPrefix}/v/g/${fileId}`, navigate)
    setIsDialogDisplayed(false)
  }

  const handlePickerSelect = (docs) => {
    if (!pickerConnection || !docs || docs.length === 0) {
      return
    }
    const doc = docs[0]
    const connection = pickerConnection
    setPickerToken(null)
    setPickerConnection(null)
    disablePageReloadApprovalCheck()
    addRecentFileEntry({
      id: doc.id,
      source: 'google-drive',
      name: doc.name,
      mimeType: doc.mimeType || '',
      lastModifiedUtc: doc.lastModifiedUtc || null,
      connectionId: connection.id,
      fileId: doc.id,
      sharePath: `${appPrefix}/v/g/${doc.id}`,
    })
    navigateToModel(`${appPrefix}/v/g/${doc.id}`, navigate)
    setIsDialogDisplayed(false)
  }

  const handlePickerCancel = () => {
    setPickerToken(null)
    setPickerConnection(null)
    setIsDialogDisplayed(true)
  }

  const openFile = () => {
    const onLoad = (filename, lastModifiedUtc) => {
      disablePageReloadApprovalCheck()
      navigateToModel(`${appPrefix}/v/new/${filename}`, navigate)
      addRecentFileEntry({
        id: filename,
        source: 'local',
        name: filename,
        lastModifiedUtc: lastModifiedUtc || null,
      })
      setPendingModelNameUpdate(filename)
    }
    if (isOpfsAvailable) {
      loadLocalFile(onLoad, false)
    } else {
      loadLocalFileFallback(onLoad, false)
    }
    setIsDialogDisplayed(false)
  }

  const handleOpenLocalRecent = (entry) => {
    disablePageReloadApprovalCheck()
    navigateToModel(`${appPrefix}/v/new/${entry.name}`, navigate)
    setIsDialogDisplayed(false)
  }

  const handleOpenGithubRecent = (entry) => {
    navigateToModel(entry.sharePath, navigate)
    setIsDialogDisplayed(false)
  }

  const BLDRS_IDENTITIES_CLAIM = 'https://bldrs.ai/identities'
  const githubIdentity = user?.[BLDRS_IDENTITIES_CLAIM]?.find((id) => id.connection === 'github')
  const githubUsername = githubIdentity?.profileData?.nickname || user?.nickname

  const handleGithubRemove = () => logout({openUrl: false})

  const handleLoginGithub = () => {
    if (useMock) {
      loginWithRedirect('github')
    } else {
      window.open('/popup-auth?connection=github', 'authPopup', 'width=600,height=600')
    }
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
          { tabLabels[currentTab] === LABEL_LOCAL &&
          <Stack data-testid='dialog-open-model-local' spacing={1} sx={{width: '100%', maxWidth: '400px'}}>
            <RecentFilesBrowseSection
              files={localRecents}
              onOpen={handleOpenLocalRecent}
              onBrowse={openFile}
              browseButtonLabel='Browse'
              browseButtonTestId='button_open_file'
            />
            {!isMobile &&
                <Stack spacing={1} sx={{mt: 4}}>
                  <Divider/>
                  <Typography variant='caption' color='text.secondary'>
                    You may also drag-and-drop models into the viewport
                  </Typography>
                </Stack>
            }
          </Stack>
          }
          { tabLabels[currentTab] === LABEL_GOOGLE &&
          <GoogleDriveTab
            onPickerReady={handlePickerReady}
            onOpenById={handleOpenById}
          />
          }
          { tabLabels[currentTab] === LABEL_GITHUB && isGithubAsSourceOn && (
            <GitHubTab/>
          )}
          { tabLabels[currentTab] === LABEL_GITHUB && !isGithubAsSourceOn && (
            showGithubBrowser ? (
              <Slide direction='left' in={showGithubBrowser} mountOnEnter>
                <Stack
                  data-testid='dialog-open-model-github-browser'
                  spacing={1}
                  sx={{width: '100%', maxWidth: '400px'}}
                >
                  <GitHubFileBrowser
                    navigate={navigate}
                    setIsDialogDisplayed={setIsDialogDisplayed}
                    onCancel={() => setShowGithubBrowser(false)}
                  />
                </Stack>
              </Slide>
            ) : (
              <Stack data-testid='dialog-open-model-github' spacing={1} sx={{width: '100%', maxWidth: '400px'}}>
                {!isAuthenticated ? (
                  <Stack spacing={2} sx={{width: '100%', alignItems: 'center', py: 2}}>
                    <Typography variant='body2' color='text.secondary' sx={{textAlign: 'center'}}>
                      Connect your GitHub to browse and open models
                    </Typography>
                    <Button
                      variant='contained'
                      color='accent'
                      startIcon={<GitHubIcon/>}
                      onClick={handleLoginGithub}
                      sx={{textTransform: 'none'}}
                      data-testid='button-login-github'
                    >
                      Connect GitHub
                    </Button>
                  </Stack>
                ) : (
                  <>
                    <RecentFilesBrowseSection
                      files={githubRecents}
                      onOpen={handleOpenGithubRecent}
                      onBrowse={() => setShowGithubBrowser(true)}
                      browseButtonLabel='Browse'
                      browseButtonTestId='button-browse-github'
                    />
                    <Box sx={{mt: 4, opacity: 0.7}}>
                      <Divider/>
                      <AccountFooter
                        label={`${githubUsername} - GitHub`}
                        testId='github-account-footer'
                        settingsButtonTestId='button-github-account-settings'
                        menuItems={[{label: 'Remove', onClick: handleGithubRemove, testId: 'menu-item-github-remove'}]}
                      />
                    </Box>
                  </>
                )}
              </Stack>
            )
          )}
          { tabLabels[currentTab] === LABEL_SAMPLES &&
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

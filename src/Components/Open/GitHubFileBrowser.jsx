
import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {Button, Checkbox, FormControlLabel, Stack, Typography} from '@mui/material'
import {navigateBaseOnModelPath} from '../../utils/location'
import {navigateToModel} from '../../utils/navigate'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {pathSuffixSupported} from '../../Filetype'
import {getFilesAndFolders} from '../../net/github/Files'
import {getOrganizations} from '../../net/github/Organizations'
import {getRepositories, getUserRepositories} from '../../net/github/Repositories'
import {getBranches} from '../../net/github/Branches'
import useStore from '../../store/useStore'
import {addRecentFileEntry, setPendingModelNameUpdate} from '../../connections/persistence'
import Selector from './Selector'
import SelectorSeparator from './SelectorSeparator'


/** localStorage key for remembering the GitHub browser's last selections. */
const GH_BROWSER_STATE_KEY = 'bldrs.openDialog.github'
/** subscriptionStatus values that carry (or will carry) Pro entitlements. */
const PRO_STATUSES = ['sharePro', 'shareProPendingReauth']


/**
 * Resolve a value that may be a list index (number) or a direct string (from Other... mode).
 *
 * @param {number|string} value
 * @param {Array<string>} list
 * @return {string}
 */
function resolveValue(value, list) {
  return typeof value === 'string' ? value : list[value]
}


/**
 * @property {Function} navigate Callback from CadView to change page url
 * @property {Function} setIsDialogDisplayed callback
 * @property {Function} onCancel Called when user clicks Cancel to go back
 * @property {string}   [accessTokenOverride] When set, drives all GitHub
 *   API calls from this token instead of the legacy Auth0-federated
 *   token in zustand. Wired by OpenModelDialog when the new connection-
 *   based GitHub flow (githubAsSource feature flag) provides a token.
 * @property {object}   [activeConnection] The Connection driving the
 *   override token, used to tag recents with a connectionId so they
 *   land in the right card on the Sources tab.
 * @return {ReactElement}
 */
export default function GitHubFileBrowser({
  navigate,
  setIsDialogDisplayed,
  onCancel,
  accessTokenOverride,
  activeConnection,
}) {
  // Prefer the override (connection-derived token) over the legacy
  // Auth0-federated `useStore.accessToken`. Once the legacy path retires
  // (PR3+), the store-backed branch can go away.
  const storeToken = useStore((state) => state.accessToken)
  const accessToken = accessTokenOverride ?? storeToken
  const [orgNamesArr, setOrgNamesArr] = useState([''])
  const [currentPath, setCurrentPath] = useState('')
  const [foldersArr, setFoldersArr] = useState([''])
  const {user} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFolderName, setSelectedFolderName] = useState('')
  const [selectedFileIndex, setSelectedFileIndex] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const [branchesArr, setBranchesArr] = useState([''])
  const [selectedBranchName, setSelectedBranchName] = useState('')
  // True once the current org's repo list is known to include a private
  // repo — i.e. the token already carries the `repo` scope, so the
  // "Enable private repos" opt-in is hidden.
  const [hasPrivateRepos, setHasPrivateRepos] = useState(false)
  // True from the moment the user opts into private repos until the token
  // refresh + refetch lands — drives the checkbox's transient checked state.
  const [grantPending, setGrantPending] = useState(false)
  const appMetadata = useStore((state) => state.appMetadata)
  const isProUser = PRO_STATUSES.includes(appMetadata?.subscriptionStatus)
  // Restore-once + refetch-on-token-change bookkeeping (see effects below).
  const restoredRef = useRef(false)
  const pendingRestoreRef = useRef(null)
  const prevTokenRef = useRef(accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((name) => `@${name}`)
  const orgName = resolveValue(selectedOrgName, orgNamesArr)
  const repoName = resolveValue(selectedRepoName, repoNamesArr)
  const fileName = filesArr[selectedFileIndex]
  const branchName = resolveValue(selectedBranchName, branchesArr)

  // Lazy-fetch the user's GitHub organizations only when this browser is mounted
  // (i.e. user clicked Browse on the GitHub tab). Avoids spurious /user/orgs
  // calls when the Open dialog is opened on a non-GitHub tab.
  useEffect(() => {
    if (!accessToken) {
      return
    }
    let cancelled = false
    /** Asynchronously fetch organizations */
    async function fetchOrganizations() {
      const orgs = await getOrganizations(accessToken)
      if (cancelled) {
        return
      }
      const orgNamesFetched = Object.keys(orgs).map((key) => orgs[key].login)
      const orgNames = [...orgNamesFetched, user && user.nickname].filter(Boolean)
      setOrgNamesArr(orgNames.length > 0 ? orgNames : [''])
    }
    fetchOrganizations()
    return () => {
      cancelled = true
    }
  }, [accessToken, user])

  const selectOrg = async (orgOrIndex) => {
    setSelectedOrgName(orgOrIndex)
    const resolvedOrgName = resolveValue(orgOrIndex, orgNamesArr)
    let repos
    if (resolvedOrgName === user.nickname) {
      repos = await getUserRepositories(accessToken, resolvedOrgName)
    } else {
      repos = await getRepositories(resolvedOrgName, accessToken)
    }
    const repoNames = Object.keys(repos).map((key) => repos[key].name)
    setRepoNamesArr(repoNames)
    // A private repo in the list means the token already has `repo` scope;
    // otherwise GitHub filtered private repos out and the opt-in should show.
    setHasPrivateRepos(Object.values(repos).some((repo) => repo?.private))
    setCurrentPath('')
    setFoldersArr([''])
    setSelectedFolderName('')
    setSelectedFileIndex('')
    setSelectedRepoName('')
  }

  const selectRepo = async (repoOrIndex) => {
    setSelectedRepoName(repoOrIndex)
    const resolvedRepoName = resolveValue(repoOrIndex, repoNamesArr)
    const {files, directories} = await getFilesAndFolders(resolvedRepoName, orgName, '/', accessToken)
    const repository = {orgName, name: resolvedRepoName}
    const branches = await getBranches(repository, accessToken)
    const branchNames = branches.map((branch) => branch.name)
    setBranchesArr(branchNames)
    setSelectedBranchName(branchNames.length > 0 ? branchNames.indexOf('main') >= 0 ? branchNames.indexOf('main') : 0 : '')

    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)

    setFilesArr(fileNames)
    setFoldersArr([...directoryNames])
    setCurrentPath('')
    setSelectedFolderName('')
    setSelectedFileIndex('')
  }

  const selectFolder = async (folderIndex) => {
    const selectedFolderName_ = foldersArr[folderIndex]

    let newPath
    if (selectedFolderName_ === '[Parent Directory]') {
      const pathSegments = currentPath.split('/').filter(Boolean)
      pathSegments.pop()
      newPath = pathSegments.join('/')
    } else {
      newPath = selectedFolderName_ === '/' ? '' : `${currentPath}/${selectedFolderName_}`.replace('//', '/')
    }

    setSelectedFolderName('')
    setCurrentPath(newPath)

    const {files, directories} = await getFilesAndFolders(repoName, orgName, newPath, accessToken)
    const fileNames = files.map((file) => file.name)
    const directoryNames = directories.map((directory) => directory.name)

    const navigationOptions = newPath ? ['[Parent Directory]', ...directoryNames] : [...directoryNames]

    setFilesArr(fileNames)
    setFoldersArr(navigationOptions)
  }

  const selectBranch = (branchOrIndex) => {
    setSelectedBranchName(branchOrIndex)
  }

  // --- Cascading clear ---------------------------------------------------
  // Clearing a field (× on its dropdown) resets it and every field below it
  // to its default state — one click back to whatever level you want.
  const resetFolderAndFile = () => {
    setSelectedFolderName('')
    setCurrentPath('')
    setFoldersArr([''])
    setFilesArr([''])
    setSelectedFileIndex('')
  }
  const clearBranch = () => {
    setSelectedBranchName('')
    resetFolderAndFile()
  }
  const clearRepo = () => {
    setSelectedRepoName('')
    setBranchesArr([''])
    setSelectedBranchName('')
    resetFolderAndFile()
  }
  const clearOrg = () => {
    setSelectedOrgName('')
    setRepoNamesArr([''])
    setSelectedRepoName('')
    setHasPrivateRepos(false)
    setBranchesArr([''])
    setSelectedBranchName('')
    resetFolderAndFile()
  }
  const clearFile = () => {
    setSelectedFileIndex('')
  }

  // --- Private-repo opt-in (A) -------------------------------------------
  // Explicit, Pro-gated action to grant the GitHub `repo` scope. OAuth
  // scopes are global (not per-org): this grants read access to private
  // repos across ALL of the user's orgs, labelled as such. Non-Pro users
  // route to subscribe. On success popup-callback flips localStorage
  // `refreshAuth`, ProfileControl refreshes the token, and the effect below
  // refetches the current org so newly-visible private repos appear.
  const awaitingGrantRef = useRef(false)
  const enablePrivateRepos = () => {
    // Guard against a second popup while one grant is already in flight.
    if (grantPending) {
      return
    }
    if (isProUser) {
      awaitingGrantRef.current = true
      setGrantPending(true)
      window.open('/popup-auth?scope=repo&connection=github', 'authPopup', 'width=600,height=600')
    } else {
      window.open('/subscribe/', '_blank', 'noopener')
    }
  }

  // Reset the pending flag when the popup closes (main window regains focus),
  // so a cancelled grant doesn't leave the checkbox stuck checked. A
  // successful grant hides the whole affordance via `hasPrivateRepos` anyway.
  useEffect(() => {
    if (!grantPending) {
      return undefined
    }
    const onFocus = () => setGrantPending(false)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [grantPending])

  // Refetch the selected org's repos after a private-repo grant lands (the
  // token changes). Gated on `awaitingGrantRef` so the routine background
  // token refresh (BaseRoutes fresh-claims) never wipes a live selection.
  useEffect(() => {
    if (prevTokenRef.current !== accessToken) {
      prevTokenRef.current = accessToken
      if (awaitingGrantRef.current && accessToken && selectedOrgName !== '') {
        awaitingGrantRef.current = false
        setGrantPending(false)
        selectOrg(selectedOrgName)
      }
    }
    // Runs only on a token change, by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  // --- Dialog state persistence ------------------------------------------
  // Persist the resolved selections so the dialog reopens where it left off
  // (across sessions, localStorage). Skips the empty initial render so a
  // good saved state is not clobbered before the restore below runs.
  useEffect(() => {
    if (!orgName) {
      return
    }
    try {
      localStorage.setItem(GH_BROWSER_STATE_KEY, JSON.stringify({
        org: orgName, repo: repoName || '', branch: branchName || '',
      }))
    } catch {
      // localStorage can throw (quota / private mode); persistence is best-effort.
    }
  }, [orgName, repoName, branchName])

  // Restore once, after the org list loads: reselect the saved org, then let
  // the repo + branch restores below chain as each list arrives. Every step
  // is best-effort — anything no longer present is silently skipped.
  useEffect(() => {
    if (restoredRef.current || orgNamesArr.length === 0 || orgNamesArr[0] === '') {
      return
    }
    restoredRef.current = true
    let saved = null
    try {
      saved = JSON.parse(localStorage.getItem(GH_BROWSER_STATE_KEY) || 'null')
    } catch {
      saved = null
    }
    if (!saved || !saved.org) {
      return
    }
    const orgIdx = orgNamesArr.indexOf(saved.org)
    if (orgIdx < 0) {
      return
    }
    pendingRestoreRef.current = {repo: saved.repo, branch: saved.branch}
    selectOrg(orgIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgNamesArr])

  // Restore the saved repo once its org's repo list has loaded.
  useEffect(() => {
    const pending = pendingRestoreRef.current
    if (!pending || !pending.repo || repoNamesArr.length === 0 || repoNamesArr[0] === '') {
      return
    }
    const repoIdx = repoNamesArr.indexOf(pending.repo)
    if (repoIdx < 0) {
      pendingRestoreRef.current = null
      return
    }
    // Keep the branch for the next stage; drop the repo so this runs once.
    pendingRestoreRef.current = {branch: pending.branch}
    selectRepo(repoIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoNamesArr])

  // Restore the saved branch once the repo's branch list has loaded.
  useEffect(() => {
    const pending = pendingRestoreRef.current
    if (!pending || pending.repo || !pending.branch ||
        branchesArr.length === 0 || branchesArr[0] === '') {
      return
    }
    pendingRestoreRef.current = null
    const branchIdx = branchesArr.indexOf(pending.branch)
    if (branchIdx >= 0) {
      selectBranch(branchIdx)
    }
  }, [branchesArr])

  const validateOrg = async (name) => {
    if (!name.trim()) {
      return false
    }
    try {
      if (name === user?.nickname) {
        await getUserRepositories(accessToken, name)
      } else {
        await getRepositories(name, accessToken)
      }
      return true
    } catch {
      return false
    }
  }

  const validateRepo = async (name) => {
    if (!name.trim() || !orgName) {
      return false
    }
    try {
      await getFilesAndFolders(name, orgName, '/', accessToken)
      return true
    } catch {
      return false
    }
  }

  const validateBranch = async (name) => {
    if (!name.trim() || !orgName || !repoName) {
      return false
    }
    try {
      const branches = await getBranches({orgName, name: repoName}, accessToken)
      return branches.some((b) => b.name === name)
    } catch {
      return false
    }
  }

  const navigateToFile = () => {
    if (pathSuffixSupported(fileName)) {
      const branch = branchName || 'main'
      const sharePath = navigateBaseOnModelPath(orgName, repoName, branch, `${currentPath}/${fileName}`)
      navigateToModel({pathname: sharePath}, navigate)
      // Tag with connectionId when the connection-based path drove this
      // browse. Without it, GitHubTab can't filter recents to the card
      // they belong to (parity with how Drive recents are scoped).
      addRecentFileEntry({
        id: sharePath,
        source: 'github',
        name: fileName,
        sharePath,
        lastModifiedUtc: null,
        ...(activeConnection ? {connectionId: activeConnection.id} : {}),
      })
      setPendingModelNameUpdate(sharePath)
      setIsDialogDisplayed(false)
    }
  }

  return (
    <Stack alignItems='center' data-testid='stack_gitHub_access_controls'>
      <Stack alignItems='center' sx={{width: '100%'}}>
        <Typography sx={{marginBottom: '10px'}}>Browse files on Github</Typography>
        <Selector
          label='Organization'
          list={orgNamesArrWithAt}
          selected={selectedOrgName}
          setSelected={selectOrg}
          validate={validateOrg}
          onClear={clearOrg}
          data-testid='openOrganization'
        />
        <Selector
          label='Repository'
          list={repoNamesArr}
          selected={selectedRepoName}
          setSelected={selectRepo}
          validate={validateRepo}
          onClear={clearRepo}
          data-testid='openRepository'
        />
        {selectedOrgName !== '' && repoNamesArr.length > 0 && repoNamesArr[0] !== '' && !hasPrivateRepos && (
          <Stack sx={{alignSelf: 'flex-start', width: '100%', px: 0.5, py: 0.5, mb: 0.5}}>
            <FormControlLabel
              sx={{ml: 0, mr: 0}}
              control={
                <Checkbox
                  size='small'
                  checked={grantPending}
                  disabled={grantPending}
                  onChange={enablePrivateRepos}
                  sx={{py: 0, pl: 0, pr: 1}}
                  data-testid='enable-private-repos'
                />
              }
              label={
                <Typography variant='body2'>
                  {isProUser ? 'Enable private repos' : 'Enable private repos (Pro)'}
                </Typography>
              }
            />
            <Typography variant='caption' sx={{color: 'text.secondary', mt: 0.25}}>
              {isProUser ?
                'Grants Share read access to your private repos across all your GitHub orgs.' :
                'Browsing private repositories is a Pro feature.'}
            </Typography>
          </Stack>
        )}
        <Selector
          label='Branch'
          list={branchesArr}
          selected={selectedBranchName}
          setSelected={selectBranch}
          validate={validateBranch}
          onClear={clearBranch}
          data-testid='openBranch'
        />
        <SelectorSeparator
          label='Folder'
          list={foldersArr}
          selected={selectedFolderName}
          setSelected={selectFolder}
          displayValue={currentPath || undefined}
          emptyText='<No subfolders>'
          data-testid='saveFolder'
        />
        <Selector
          label='File'
          list={filesArr}
          selected={selectedFileIndex}
          setSelected={setSelectedFileIndex}
          onClear={clearFile}
          data-testid='openFile'
        />
      </Stack>
      <Stack direction='row' spacing={1} sx={{mt: 1}}>
        <Button
          onClick={navigateToFile}
          disabled={selectedFileIndex === ''}
          variant='contained'
          color='accent'
          sx={{
            'textTransform': 'none',
            '&.Mui-disabled': {
              backgroundColor: 'accent.main',
              color: 'accent.contrastText',
              opacity: 0.5,
            },
          }}
          data-testid='button-openfromgithub'
        >
          Open
        </Button>
        <Button
          onClick={onCancel}
          variant='outlined'
          sx={{textTransform: 'none'}}
          data-testid='button-cancel-github'
        >
          Cancel
        </Button>
      </Stack>
    </Stack>
  )
}

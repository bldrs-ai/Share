import React, {useState, useCallback, useEffect} from 'react'
import {Button, Stack, Typography} from '@mui/material'
import useStore from '../../store/useStore'
import {navigateToModel} from '../../utils/navigate'


const SCOPES = 'https://www.googleapis.com/auth/drive.readonly'
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'

// Build-time constants — esbuild replaces process.env.X with actual values
const API_KEY = process.env.GOOGLE_API_KEY
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID


/**
 * Google Drive file browser for the Open dialog.
 * Uses Google Identity Services for auth and Google Picker for file selection.
 */
export default function GoogleDriveBrowser({navigate, setIsDialogDisplayed}) {
  const appPrefix = useStore((state) => state.appPrefix)
  const [accessToken, setAccessToken] = useState(null)
  const [userName, setUserName] = useState(null)
  const [gisLoaded, setGisLoaded] = useState(false)
  const [error, setError] = useState(null)

  // Load Google Identity Services
  useEffect(() => {
    if (!document.getElementById('google-gis-script')) {
      const script = document.createElement('script')
      script.id = 'google-gis-script'
      script.src = 'https://accounts.google.com/gsi/client'
      script.onload = () => setGisLoaded(true)
      script.onerror = () => setError('Failed to load Google Identity Services')
      document.head.appendChild(script)
    } else {
      setGisLoaded(true)
    }
  }, [])

  const handleSignIn = useCallback(() => {
    console.log('[GoogleDrive] handleSignIn called')
    console.log('[GoogleDrive] CLIENT_ID:', CLIENT_ID)
    console.log('[GoogleDrive] API_KEY:', API_KEY?.substring(0, 10) + '...')
    console.log('[GoogleDrive] google.accounts.oauth2:', !!window.google?.accounts?.oauth2)

    if (!window.google?.accounts?.oauth2) {
      setError('Google Identity Services not loaded')
      return
    }

    console.log('[GoogleDrive] Initializing token client...')
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      error_callback: (err) => {
        console.error('[GoogleDrive] Error callback:', err)
        setError(`Auth error: ${err.type || err.message || JSON.stringify(err)}`)
      },
      callback: (response) => {
        console.log('[GoogleDrive] OAuth response:', response)
        if (response.error) {
          console.error('[GoogleDrive] Auth error:', response.error, response.error_description)
          setError(`Auth error: ${response.error} — ${response.error_description || ''}`)
          return
        }
        console.log('[GoogleDrive] Got access token:', response.access_token?.substring(0, 20) + '...')
        setAccessToken(response.access_token)
        // Store globally + in sessionStorage so it survives page navigation
        window.__GOOGLE_ACCESS_TOKEN__ = response.access_token
        sessionStorage.setItem('google_access_token', response.access_token)
        // Get user info from Drive about endpoint (doesn't need userinfo scope)
        fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: {Authorization: `Bearer ${response.access_token}`},
        })
          .then((r) => r.json())
          .then((info) => {
            console.log('[GoogleDrive] User info:', info)
            setUserName(info.user?.displayName || info.user?.emailAddress || 'Google user')
          })
          .catch((err) => {
            console.warn('[GoogleDrive] User info fetch failed:', err)
            setUserName('Google user')
          })
      },
    })
    console.log('[GoogleDrive] Requesting access token...')
    tokenClient.requestAccessToken()
    console.log('[GoogleDrive] requestAccessToken called (popup should appear)')
  }, [])

  const handleSignOut = useCallback(() => {
    if (accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken)
    }
    setAccessToken(null)
    setUserName(null)
    window.__GOOGLE_ACCESS_TOKEN__ = null
  }, [accessToken])

  const [files, setFiles] = useState([])
  const [currentFolder, setCurrentFolder] = useState('root')
  const [folderPath, setFolderPath] = useState([{id: 'root', name: 'My Drive'}])
  const [loading, setLoading] = useState(false)

  const listFiles = useCallback(async (folderId = 'root') => {
    if (!accessToken) return
    setLoading(true)
    try {
      const q = `'${folderId}' in parents and trashed = false`
      const fields = 'files(id,name,mimeType,size,modifiedTime,iconLink)'
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=folder,name&pageSize=50`
      const res = await fetch(url, {
        headers: {Authorization: `Bearer ${accessToken}`},
      })
      const data = await res.json()
      console.log('[GoogleDrive] Files:', data)
      setFiles(data.files || [])
      setCurrentFolder(folderId)
    } catch (err) {
      console.warn('[GoogleDrive] List files failed:', err)
      setFiles([])
    }
    setLoading(false)
  }, [accessToken])

  // Load root folder on sign in
  useEffect(() => {
    if (accessToken) listFiles('root')
  }, [accessToken, listFiles])

  const openFolder = useCallback((folder) => {
    setFolderPath((prev) => [...prev, {id: folder.id, name: folder.name}])
    listFiles(folder.id)
  }, [listFiles])

  const navigateToFolder = useCallback((index) => {
    const target = folderPath[index]
    setFolderPath((prev) => prev.slice(0, index + 1))
    listFiles(target.id)
  }, [folderPath, listFiles])

  const selectFile = useCallback((file) => {
    setIsDialogDisplayed(false)
    // Navigate to the shareable Google Drive URL
    navigateToModel(`${appPrefix}/v/g/${file.id}`, navigate)
  }, [appPrefix, navigate, setIsDialogDisplayed])

  if (!API_KEY || !CLIENT_ID) {
    return (
      <Stack spacing={1} sx={{py: 2, alignItems: 'center'}}>
        <Typography sx={{fontSize: '13px', opacity: 0.5}}>
          Google Drive integration not configured
        </Typography>
        <Typography sx={{fontSize: '11px', opacity: 0.3}}>
          Set GOOGLE_API_KEY and GOOGLE_CLIENT_ID environment variables
        </Typography>
      </Stack>
    )
  }

  if (error) {
    return (
      <Stack spacing={1} sx={{py: 2, alignItems: 'center'}}>
        <Typography sx={{fontSize: '13px', color: '#f44336'}}>{error}</Typography>
      </Stack>
    )
  }

  if (!accessToken) {
    return (
      <Stack spacing={1} sx={{py: 2, alignItems: 'center'}}>
        <Typography sx={{fontSize: '13px', opacity: 0.5}}>
          Sign in with Google to browse your Drive files
        </Typography>
        <Button
          onClick={handleSignIn}
          variant='outlined'
          size='small'
          disabled={!gisLoaded}
          sx={{textTransform: 'none', fontSize: '13px'}}
        >
          Sign in with Google
        </Button>
      </Stack>
    )
  }

  const isFolder = (f) => f.mimeType === 'application/vnd.google-apps.folder'

  const formatSize = (bytes) => {
    if (!bytes) return ''
    const mb = bytes / (1024 * 1024)
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
  }

  return (
    <Stack spacing={1} sx={{width: '100%'}}>
      {/* Header */}
      <Stack direction='row' alignItems='center' justifyContent='space-between'>
        <Typography sx={{fontSize: '11px', opacity: 0.5}}>
          {userName || 'Google user'}
        </Typography>
        <Button
          onClick={handleSignOut}
          size='small'
          sx={{textTransform: 'none', fontSize: '11px', opacity: 0.5, minWidth: 0}}
        >
          Sign out
        </Button>
      </Stack>

      {/* Breadcrumb */}
      <Stack direction='row' spacing={0.5} sx={{flexWrap: 'wrap', alignItems: 'center'}}>
        {folderPath.map((folder, i) => (
          <React.Fragment key={folder.id}>
            {i > 0 && <Typography sx={{fontSize: '11px', opacity: 0.3}}>/</Typography>}
            <Typography
              onClick={() => navigateToFolder(i)}
              sx={{
                fontSize: '11px',
                cursor: 'pointer',
                opacity: i === folderPath.length - 1 ? 0.8 : 0.4,
                '&:hover': {opacity: 1, color: 'var(--color-primary)'},
              }}
            >
              {folder.name}
            </Typography>
          </React.Fragment>
        ))}
      </Stack>

      {/* File list */}
      <Stack sx={{maxHeight: 250, overflowY: 'auto'}}>
        {loading && <Typography sx={{fontSize: '13px', opacity: 0.5, py: 2, textAlign: 'center'}}>Loading...</Typography>}
        {!loading && files.length === 0 && (
          <Typography sx={{fontSize: '13px', opacity: 0.4, py: 2, textAlign: 'center'}}>Empty folder</Typography>
        )}
        {!loading && files.map((file) => (
          <Stack
            key={file.id}
            direction='row'
            alignItems='center'
            spacing={1}
            onClick={() => isFolder(file) ? openFolder(file) : selectFile(file)}
            sx={{
              padding: '6px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              '&:hover': {backgroundColor: 'var(--color-surface-hover)'},
            }}
          >
            <Typography sx={{fontSize: '16px', width: 20, textAlign: 'center'}}>
              {isFolder(file) ? '📁' : '📄'}
            </Typography>
            <Typography sx={{fontSize: '13px', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
              {file.name}
            </Typography>
            {!isFolder(file) && file.size && (
              <Typography sx={{fontSize: '11px', opacity: 0.4, flexShrink: 0}}>
                {formatSize(Number(file.size))}
              </Typography>
            )}
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}

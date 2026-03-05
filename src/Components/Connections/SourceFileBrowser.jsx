import React, {useCallback, useEffect, useState} from 'react'
import {
  Box,
  Button,
  CircularProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import {
  ArrowBack as BackIcon,
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material'
import {getBrowser} from '../../connections/registry'
import {loadFileFromSource} from '../../connections/loadFromSource'
import {disablePageReloadApprovalCheck} from '../../utils/event'
import {navigateToModel} from '../../utils/navigate'
import useStore from '../../store/useStore'


/**
 * Hierarchical file/folder browser for a Source.
 * Follows the pattern of GitHubFileBrowser but uses the SourceBrowser interface.
 *
 * @property {object} connection The Connection object
 * @property {object} source The Source object
 * @property {Function} navigate Router navigate function
 * @property {Function} setIsDialogDisplayed Callback to close the Open dialog
 * @property {Function} onBack Callback to go back to the sources list
 * @return {React.ReactElement}
 */
export default function SourceFileBrowser({
  connection,
  source,
  navigate,
  setIsDialogDisplayed,
  onBack,
}) {
  const [files, setFiles] = useState([])
  const [folders, setFolders] = useState([])
  const [pathStack, setPathStack] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState(null)
  const appPrefix = useStore((state) => state.appPrefix)

  const currentFolderId = pathStack.length > 0 ?
    pathStack[pathStack.length - 1].id :
    null

  const loadFolder = useCallback(async (folderId) => {
    const browser = getBrowser(connection.providerId)
    if (!browser) {
      return
    }

    setIsLoading(true)
    setError(null)
    setSelectedFile(null)

    try {
      const result = await browser.listFiles(
        connection,
        source,
        folderId || undefined,
      )
      setFolders(result.folders)
      setFiles(result.files)
    } catch (err) {
      setError(err.message || 'Failed to list files')
    } finally {
      setIsLoading(false)
    }
  }, [connection, source])

  // Load root folder on mount
  useEffect(() => {
    loadFolder(null)
  }, [loadFolder])

  const navigateIntoFolder = (folder) => {
    setPathStack((prev) => [...prev, {id: folder.id, name: folder.name}])
    loadFolder(folder.id)
  }

  const navigateBack = () => {
    if (pathStack.length === 0) {
      onBack()
      return
    }
    const newStack = pathStack.slice(0, -1)
    setPathStack(newStack)
    const parentId = newStack.length > 0 ? newStack[newStack.length - 1].id : null
    loadFolder(parentId)
  }

  const handleOpenFile = async () => {
    if (!selectedFile) {
      return
    }

    setIsDownloading(true)
    setError(null)

    try {
      await loadFileFromSource(connection, source, selectedFile, (filename) => {
        disablePageReloadApprovalCheck()
        navigateToModel(`${appPrefix}/v/new/${filename}`, navigate)
        setIsDialogDisplayed(false)
      })
    } catch (err) {
      setError(err.message || 'Failed to open file')
    } finally {
      setIsDownloading(false)
    }
  }

  // Build breadcrumb text
  const breadcrumb = [source.label, ...pathStack.map((p) => p.name)].join(' / ')

  return (
    <Stack spacing={1} sx={{width: '100%', maxWidth: '300px'}}>
      {/* Breadcrumb header */}
      <Stack direction='row' alignItems='center' spacing={0.5}>
        <Button
          size='small'
          startIcon={<BackIcon/>}
          onClick={navigateBack}
          sx={{textTransform: 'none', minWidth: 'auto'}}
        >
          Back
        </Button>
        <Typography variant='caption' noWrap sx={{flex: 1}}>
          {breadcrumb}
        </Typography>
      </Stack>

      {/* Loading state */}
      {isLoading && (
        <Box sx={{display: 'flex', justifyContent: 'center', py: 2}}>
          <CircularProgress size={24}/>
        </Box>
      )}

      {/* Error state */}
      {error && (
        <Typography variant='caption' color='error'>
          {error}
        </Typography>
      )}

      {/* File and folder list */}
      {!isLoading && (
        <List
          dense
          sx={{
            maxHeight: '250px',
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          {folders.map((folder) => (
            <ListItemButton
              key={folder.id}
              onClick={() => navigateIntoFolder(folder)}
              data-testid={`source-folder-${folder.id}`}
            >
              <ListItemIcon sx={{minWidth: 32}}>
                <FolderIcon fontSize='small'/>
              </ListItemIcon>
              <ListItemText
                primary={folder.name}
                primaryTypographyProps={{variant: 'body2', noWrap: true}}
              />
            </ListItemButton>
          ))}
          {files.map((file) => (
            <ListItemButton
              key={file.id}
              selected={selectedFile?.id === file.id}
              onClick={() => setSelectedFile(file)}
              data-testid={`source-file-${file.id}`}
            >
              <ListItemIcon sx={{minWidth: 32}}>
                <FileIcon fontSize='small'/>
              </ListItemIcon>
              <ListItemText
                primary={file.name}
                secondary={file.size ? formatSize(file.size) : undefined}
                primaryTypographyProps={{variant: 'body2', noWrap: true}}
                secondaryTypographyProps={{variant: 'caption'}}
              />
            </ListItemButton>
          ))}
          {folders.length === 0 && files.length === 0 && (
            <Typography variant='caption' sx={{p: 1, color: 'text.secondary'}}>
              This folder is empty
            </Typography>
          )}
        </List>
      )}

      {/* Open button */}
      <Button
        onClick={handleOpenFile}
        disabled={!selectedFile || isDownloading}
        variant='contained'
        data-testid='button-open-from-source'
      >
        {isDownloading ? 'Loading...' : 'Open'}
      </Button>
    </Stack>
  )
}


/** Format bytes to human-readable size */
function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

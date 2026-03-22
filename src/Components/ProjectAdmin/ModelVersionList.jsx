import React, {useState, useEffect, useCallback, useRef} from 'react'
import {Box, ButtonBase, Chip, IconButton, Stack, TextField, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useNavigate} from 'react-router-dom'
import {GitCommit, Play, Trash2, Upload} from 'lucide-react'
import {readProjectFile} from '../../Infrastructure/ProjectData/ProjectFileStore'
import {saveDnDFileToOpfs} from '../../OPFS/utils'
import {navigateToModel} from '../../utils/navigate'
import useStore from '../../store/useStore'


function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})
}


/**
 * Version history for a model with upload/load/delete.
 */
export default function ModelVersionList({modelId, currentVersionId}) {
  const theme = useTheme()
  const navigate = useNavigate()
  const modelVersions = useStore((state) => state.modelVersions)
  const loadModelVersions = useStore((state) => state.loadModelVersions)
  const addModelVersion = useStore((state) => state.addModelVersion)
  const deleteModelVersion = useStore((state) => state.deleteModelVersion)
  const setIsProjectAdminVisible = useStore((state) => state.setIsProjectAdminVisible)
  const appPrefix = useStore((state) => state.appPrefix)

  const [showUpload, setShowUpload] = useState(false)
  const [comment, setComment] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadModelVersions(modelId)
  }, [modelId, loadModelVersions])

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    await addModelVersion(modelId, file, comment)
    setComment('')
    setShowUpload(false)
    e.target.value = ''
  }, [modelId, comment, addModelVersion])

  const handleLoadVersion = useCallback(async (version) => {
    try {
      const file = await readProjectFile(version.opfsPath)
      const ext = version.originalFileName.split('.').pop() || 'ifc'
      setIsProjectAdminVisible(false)
      // Use the same DnD flow: write to OPFS cache, then navigate
      saveDnDFileToOpfs(file, ext, (fileName) => {
        navigateToModel(`${appPrefix}/v/new/${fileName}`, navigate)
      })
    } catch (err) {
      console.warn('Failed to load model version:', err)
    }
  }, [appPrefix, navigate, setIsProjectAdminVisible])

  return (
    <Box sx={{pl: 3, pb: 1}}>
      {modelVersions.map((version) => (
        <ButtonBase
          key={version.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '4px 8px',
            borderRadius: '4px',
            textAlign: 'left',
            backgroundColor: version.id === currentVersionId
              ? theme.palette.action.selected
              : 'transparent',
            '&:hover': {background: theme.palette.action.hover},
          }}
          onClick={() => handleLoadVersion(version)}
        >
          <GitCommit size={12} strokeWidth={1.5} style={{opacity: 0.4, flexShrink: 0}}/>
          <Chip label={`V${version.versionNumber}`} size='small' sx={{height: 18, fontSize: '10px', fontWeight: 600}}/>
          <Typography variant='caption' sx={{fontSize: '11px', flexGrow: 1, opacity: 0.7}}>
            {version.comment}
          </Typography>
          <Typography variant='caption' sx={{fontSize: '10px', opacity: 0.4}}>
            {formatDate(version.createdAt)}
          </Typography>
          <Typography variant='caption' sx={{fontSize: '10px', opacity: 0.4}}>
            {formatBytes(version.fileSizeBytes)}
          </Typography>
          <Tooltip title='Load in viewer'>
            <IconButton
              size='small'
              onClick={(e) => { e.stopPropagation(); handleLoadVersion(version) }}
              sx={{opacity: 0.5, '&:hover': {opacity: 1, color: '#00ff00'}}}
            >
              <Play size={12}/>
            </IconButton>
          </Tooltip>
          <Tooltip title='Delete version'>
            <IconButton
              size='small'
              onClick={(e) => { e.stopPropagation(); deleteModelVersion(version.id) }}
              sx={{opacity: 0.3, '&:hover': {opacity: 1, color: '#f44336'}}}
            >
              <Trash2 size={11}/>
            </IconButton>
          </Tooltip>
        </ButtonBase>
      ))}

      {showUpload ? (
        <Stack direction='row' spacing={1} sx={{pt: 0.5, pl: 1}} alignItems='center'>
          <TextField
            size='small'
            placeholder='Version comment...'
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            sx={{flexGrow: 1}}
            inputProps={{style: {fontSize: '11px', padding: '3px 6px'}}}
          />
          <input
            ref={fileInputRef}
            type='file'
            accept='.ifc,.step,.stp,.glb,.gltf,.obj,.stl'
            style={{display: 'none'}}
            onChange={handleFileSelected}
          />
          <ButtonBase onClick={handleUploadClick} sx={{fontSize: '11px', opacity: 0.7, '&:hover': {opacity: 1}}}>
            <Upload size={12} style={{marginRight: 4}}/> Pick file
          </ButtonBase>
          <ButtonBase onClick={() => setShowUpload(false)} sx={{fontSize: '11px', opacity: 0.5}}>
            Cancel
          </ButtonBase>
        </Stack>
      ) : (
        <ButtonBase
          onClick={() => setShowUpload(true)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '3px 8px',
            borderRadius: '4px',
            opacity: 0.5,
            fontSize: '11px',
            '&:hover': {opacity: 1, background: theme.palette.action.hover},
          }}
        >
          <Upload size={12} strokeWidth={1.5}/>
          Upload new version
        </ButtonBase>
      )}
    </Box>
  )
}

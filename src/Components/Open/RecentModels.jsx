import React, {ReactElement} from 'react'
import {Box, Chip, Grid, Typography} from '@mui/material'
import {
  HistoryOutlined as HistoryIcon,
  InsertDriveFileOutlined as FileIcon,
} from '@mui/icons-material'


const STORAGE_KEY = 'bldrs-recent-models'
const MAX_RECENT = 12


/**
 * Save a model to recent history.
 *
 * @param {string} name Display name
 * @param {string} path URL path to navigate to
 */
export function addRecentModel(name, path) {
  try {
    const recent = getRecentModels()
    // Remove duplicate if exists
    const filtered = recent.filter((m) => m.path !== path)
    // Add to front
    filtered.unshift({name, path, timestamp: Date.now()})
    // Trim to max
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)))
  } catch (e) {
    console.warn('Failed to save recent model:', e)
  }
}


/**
 * Get list of recently opened models.
 *
 * @return {Array<{name: string, path: string, timestamp: number}>}
 */
export function getRecentModels() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}


/**
 * Grid of recently opened models.
 *
 * @property {Function} navigate Callback to change page url
 * @property {Function} setIsDialogDisplayed Callback to close dialog
 * @return {ReactElement}
 */
export default function RecentModels({navigate, setIsDialogDisplayed}) {
  const {navigateToModel} = require('../../utils/navigate')
  const recent = getRecentModels()

  if (recent.length === 0) {
    return (
      <Box sx={{textAlign: 'center', py: 2}}>
        <HistoryIcon sx={{fontSize: 32, opacity: 0.3, mb: 1}}/>
        <Typography variant='caption' sx={{display: 'block', opacity: 0.5}}>
          No recent models. Open a model to see it here.
        </Typography>
      </Box>
    )
  }

  const handleSelect = (model) => {
    navigateToModel({pathname: model.path}, navigate)
    setIsDialogDisplayed(false)
  }

  const formatTime = (ts) => {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return (
    <Grid
      container
      spacing={1}
      justifyContent='center'
      data-testid='recent-models'
    >
      {recent.map((model, i) => (
        <Grid item xs={6} key={i}>
          <Chip
            label={
              <>
                <FileIcon sx={{height: '1.2em', opacity: 0.6}}/>
                <Typography variant='caption' sx={{
                  marginTop: '.2em',
                  fontSize: '11px',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  maxWidth: '8em',
                  whiteSpace: 'nowrap',
                }}>
                  {model.name}
                </Typography>
                <Typography variant='caption' sx={{fontSize: '9px', opacity: 0.4}}>
                  {formatTime(model.timestamp)}
                </Typography>
              </>
            }
            variant='sampleModel'
            onClick={() => handleSelect(model)}
            color='primary'
          />
        </Grid>
      ))}
    </Grid>
  )
}

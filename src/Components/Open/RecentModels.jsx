import React, {ReactElement} from 'react'
import {Box, ButtonBase, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {Clock, FileText} from 'lucide-react'


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
    const filtered = recent.filter((m) => m.path !== path)
    filtered.unshift({name, path, timestamp: Date.now()})
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)))
  } catch (e) {
    console.warn('Failed to save recent model:', e)
  }
}


/**
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
 * @property {Function} navigate
 * @property {Function} setIsDialogDisplayed
 * @return {ReactElement}
 */
export default function RecentModels({navigate, setIsDialogDisplayed}) {
  const {navigateToModel} = require('../../utils/navigate')
  const theme = useTheme()
  const recent = getRecentModels()

  if (recent.length === 0) {
    return (
      <Box sx={{textAlign: 'center', py: 3, opacity: 0.4}}>
        <Clock size={24} strokeWidth={1.5} style={{marginBottom: 8}}/>
        <Typography variant='body2' sx={{fontSize: '12px'}}>
          No recent models
        </Typography>
      </Box>
    )
  }

  const handleSelect = (model) => {
    navigateToModel({pathname: model.path}, navigate)
    setIsDialogDisplayed(false)
  }

  const formatTime = (ts) => {
    const diffMs = Date.now() - ts
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', gap: '2px', width: '100%'}} data-testid='recent-models'>
      {recent.map((model, i) => (
        <ButtonBase
          key={i}
          onClick={() => handleSelect(model)}
          sx={{
            'display': 'flex',
            'alignItems': 'center',
            'gap': '0.6rem',
            'width': '100%',
            'padding': '6px 10px',
            'borderRadius': '4px',
            'textAlign': 'left',
            'justifyContent': 'flex-start',
            '&:hover': {background: theme.palette.action.hover},
          }}
        >
          <FileText size={14} strokeWidth={1.5} style={{opacity: 0.5, flexShrink: 0}}/>
          <Typography variant='body2' sx={{fontSize: '13px', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
            {model.name}
          </Typography>
          <Typography variant='caption' sx={{fontSize: '10px', opacity: 0.4, flexShrink: 0}}>
            {formatTime(model.timestamp)}
          </Typography>
        </ButtonBase>
      ))}
    </Box>
  )
}

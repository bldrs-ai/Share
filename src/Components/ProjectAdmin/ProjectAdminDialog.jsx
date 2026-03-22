import React, {useState, useCallback} from 'react'
import {Box, Button, IconButton, Stack, Typography} from '@mui/material'
import {Download, Check, AlertCircle, Leaf, Zap, Droplets, Sun, Moon} from 'lucide-react'
import Tabs from '../Tabs'
import {CloseButton} from '../Buttons'
import CompanyList from './CompanyList'
import ProjectList from './ProjectList'
import ModelList from './ModelList'
import {themes, applyTheme, getSavedTheme, saveTheme, getSceneBackground} from '../../theme/themes'
import {exportToDirectory} from '../../Infrastructure/ProjectData/SeedManager'
import useStore from '../../store/useStore'


const TAB_LABELS = ['Companies', 'Projects', 'Models', 'Style']
const THEME_ICONS = [Leaf, Zap, Droplets]


/**
 * Settings panel — right-side overlay (same layout as apps/floor plan).
 * Contains Companies, Projects, Models, and Style tabs.
 */
export default function SettingsPanel() {
  const isVisible = useStore((state) => state.isProjectAdminVisible)
  const setIsVisible = useStore((state) => state.setIsProjectAdminVisible)
  const repo = useStore((state) => state.projectRepository)
  const viewer = useStore((state) => state.viewer)
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const [currentTab, setCurrentTab] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)

  // Theme state
  const saved = getSavedTheme()
  const [activeTheme, setActiveTheme] = useState(saved.themeIndex)
  const [darkMode, setDarkMode] = useState(saved.mode === 'dark')

  const handleExport = useCallback(async () => {
    setExporting(true)
    setSaveStatus(null)
    try {
      await exportToDirectory(repo)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[Settings] Export failed:', err)
        setSaveStatus('error')
        setTimeout(() => setSaveStatus(null), 3000)
      }
    }
    setExporting(false)
  }, [repo])

  const handleClose = useCallback(() => {
    setIsVisible(false)
  }, [setIsVisible])

  const updateSceneBg = useCallback(() => {
    if (!viewer?.context) return
    try {
      const scene = viewer.context.getScene()
      const {Color} = require('three')
      scene.background = new Color(getSceneBackground())
    } catch { /* */ }
  }, [viewer])

  const selectTheme = useCallback((index) => {
    const mode = darkMode ? 'dark' : 'light'
    applyTheme(index, mode)
    saveTheme(index, mode)
    setActiveTheme(index)
    updateSceneBg()
  }, [darkMode, updateSceneBg])

  const toggleDarkMode = useCallback(() => {
    const newMode = darkMode ? 'light' : 'dark'
    applyTheme(activeTheme, newMode)
    saveTheme(activeTheme, newMode)
    setDarkMode(!darkMode)
    updateSceneBg()
  }, [darkMode, activeTheme, updateSceneBg])

  if (!isVisible) return null

  return (
    <div style={{
      position: 'fixed',
      top: 40,
      right: 0,
      width: '50vw',
      maxWidth: 600,
      height: 'calc(100vh - 40px)',
      borderLeft: '1px solid var(--color-border)',
      backgroundColor: 'var(--color-bg)',
      color: 'var(--color-text)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10,
      pointerEvents: 'auto',
      fontSize: '13px',
    }}>
      {/* Title bar */}
      <Stack
        direction='row'
        alignItems='center'
        justifyContent='space-between'
        sx={{px: 2, py: 1, borderBottom: '1px solid var(--color-border)', minHeight: 36}}
      >
        <Typography sx={{fontSize: '13px', fontWeight: 500}}>Settings</Typography>
        <CloseButton onCloseClick={handleClose}/>
      </Stack>

      {/* Tabs */}
      <Box sx={{borderBottom: '1px solid var(--color-border)'}}>
        <Tabs tabLabels={TAB_LABELS} currentTab={currentTab} actionCb={setCurrentTab}/>
      </Box>

      {/* Content */}
      <Box sx={{flex: 1, overflow: 'auto', p: 2}}>
        {currentTab === 0 && <CompanyList/>}
        {currentTab === 1 && <ProjectList/>}
        {currentTab === 2 && <ModelList/>}
        {currentTab === 3 && (
          <Stack spacing={3}>
            {/* Theme selection */}
            <Box>
              <Typography sx={{fontSize: '11px', textTransform: 'uppercase', opacity: 0.5, mb: 1}}>Theme</Typography>
              <Stack direction='row' spacing={1}>
                {themes.map((t, i) => {
                  const Icon = THEME_ICONS[i]
                  const isActive = activeTheme === i
                  return (
                    <Button
                      key={t.name}
                      variant={isActive ? 'contained' : 'outlined'}
                      startIcon={<Icon size={16}/>}
                      onClick={() => selectTheme(i)}
                      sx={{
                        textTransform: 'none',
                        fontSize: '13px',
                        borderColor: 'var(--color-border)',
                        color: isActive ? 'var(--color-primary-text)' : 'var(--color-text)',
                        backgroundColor: isActive ? 'var(--color-primary)' : 'transparent',
                        '&:hover': {
                          backgroundColor: isActive ? 'var(--color-primary-hover)' : 'var(--color-surface-hover)',
                          borderColor: 'var(--color-primary)',
                        },
                      }}
                    >
                      {t.name}
                    </Button>
                  )
                })}
              </Stack>
            </Box>

            {/* Dark/Light mode */}
            <Box>
              <Typography sx={{fontSize: '11px', textTransform: 'uppercase', opacity: 0.5, mb: 1}}>Mode</Typography>
              <Stack direction='row' spacing={1}>
                <Button
                  variant={!darkMode ? 'contained' : 'outlined'}
                  startIcon={<Sun size={16}/>}
                  onClick={() => { if (darkMode) toggleDarkMode() }}
                  sx={{
                    textTransform: 'none',
                    fontSize: '13px',
                    borderColor: 'var(--color-border)',
                    color: !darkMode ? 'var(--color-primary-text)' : 'var(--color-text)',
                    backgroundColor: !darkMode ? 'var(--color-primary)' : 'transparent',
                    '&:hover': {
                      backgroundColor: !darkMode ? 'var(--color-primary-hover)' : 'var(--color-surface-hover)',
                      borderColor: 'var(--color-primary)',
                    },
                  }}
                >
                  Light
                </Button>
                <Button
                  variant={darkMode ? 'contained' : 'outlined'}
                  startIcon={<Moon size={16}/>}
                  onClick={() => { if (!darkMode) toggleDarkMode() }}
                  sx={{
                    textTransform: 'none',
                    fontSize: '13px',
                    borderColor: 'var(--color-border)',
                    color: darkMode ? 'var(--color-primary-text)' : 'var(--color-text)',
                    backgroundColor: darkMode ? 'var(--color-primary)' : 'transparent',
                    '&:hover': {
                      backgroundColor: darkMode ? 'var(--color-primary-hover)' : 'var(--color-surface-hover)',
                      borderColor: 'var(--color-primary)',
                    },
                  }}
                >
                  Dark
                </Button>
              </Stack>
            </Box>
          </Stack>
        )}
      </Box>

      {/* Footer — Save to Repository (localhost only) */}
      {isLocalhost && (
        <Stack
          direction='row'
          justifyContent='flex-end'
          alignItems='center'
          spacing={1}
          sx={{px: 2, py: 1, borderTop: '1px solid var(--color-border)'}}
        >
          {saveStatus === 'success' && (
            <Typography sx={{fontSize: '11px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px'}}>
              <Check size={13}/> Saved
            </Typography>
          )}
          {saveStatus === 'error' && (
            <Typography sx={{fontSize: '11px', color: '#f44336', display: 'flex', alignItems: 'center', gap: '4px'}}>
              <AlertCircle size={13}/> Save failed
            </Typography>
          )}
          <Button
            size='small'
            startIcon={<Download size={14}/>}
            onClick={handleExport}
            disabled={exporting}
            sx={{fontSize: '11px', textTransform: 'none', color: 'var(--color-text)'}}
          >
            {exporting ? 'Saving...' : 'Save to Repository'}
          </Button>
        </Stack>
      )}
    </div>
  )
}

import React, {useState, useCallback} from 'react'
import {Button, Stack, Typography} from '@mui/material'
import {Settings, Download, Check, AlertCircle} from 'lucide-react'
import Dialog from '../Dialog'
import Tabs from '../Tabs'
import CompanyList from './CompanyList'
import ProjectList from './ProjectList'
import ModelList from './ModelList'
import {exportToDirectory} from '../../Infrastructure/ProjectData/SeedManager'
import useStore from '../../store/useStore'


const TAB_LABELS = ['Companies', 'Projects', 'Models']


/**
 * Admin dialog for managing companies and projects.
 */
export default function ProjectAdminDialog() {
  const isVisible = useStore((state) => state.isProjectAdminVisible)
  const setIsVisible = useStore((state) => state.setIsProjectAdminVisible)
  const repo = useStore((state) => state.projectRepository)
  const [currentTab, setCurrentTab] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // null | 'success' | 'error'

  const handleExport = useCallback(async () => {
    setExporting(true)
    setSaveStatus(null)
    try {
      await exportToDirectory(repo)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[ProjectAdmin] Export failed:', err)
        setSaveStatus('error')
        setTimeout(() => setSaveStatus(null), 3000)
      }
    }
    setExporting(false)
  }, [repo])

  return (
    <Dialog
      headerIcon={<Settings size={18} strokeWidth={1.75}/>}
      headerText='Project Management'
      isDialogDisplayed={isVisible}
      setIsDialogDisplayed={setIsVisible}
    >
      <Tabs tabLabels={TAB_LABELS} currentTab={currentTab} actionCb={setCurrentTab}/>
      <Stack sx={{minHeight: 200, pt: 1}}>
        {currentTab === 0 && <CompanyList/>}
        {currentTab === 1 && <ProjectList/>}
        {currentTab === 2 && <ModelList/>}
      </Stack>
      <Stack direction='row' justifyContent='flex-end' alignItems='center' spacing={1} sx={{pt: 1, borderTop: '1px solid', borderColor: 'divider'}}>
        {saveStatus === 'success' && (
          <Typography sx={{fontSize: '11px', color: '#4caf50', display: 'flex', alignItems: 'center', gap: '4px'}}>
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
          sx={{fontSize: '11px', textTransform: 'none'}}
        >
          {exporting ? 'Saving...' : 'Save to Repository'}
        </Button>
      </Stack>
    </Dialog>
  )
}

import React, {useState} from 'react'
import {Stack} from '@mui/material'
import {Settings} from 'lucide-react'
import Dialog from '../Dialog'
import Tabs from '../Tabs'
import CompanyList from './CompanyList'
import ProjectList from './ProjectList'
import ModelList from './ModelList'
import useStore from '../../store/useStore'


const TAB_LABELS = ['Companies', 'Projects', 'Models']


/**
 * Admin dialog for managing companies and projects.
 */
export default function ProjectAdminDialog() {
  const isVisible = useStore((state) => state.isProjectAdminVisible)
  const setIsVisible = useStore((state) => state.setIsProjectAdminVisible)
  const [currentTab, setCurrentTab] = useState(0)

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
    </Dialog>
  )
}

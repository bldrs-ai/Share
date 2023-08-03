import React, {useState, useEffect} from 'react'
import Box from '@mui/material/Box'
import {useAuth0} from '@auth0/auth0-react'
import Dialog from './Dialog'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import {getOrganizations} from '../utils/GitHub'
import OpenIcon from '../assets/icons/Open.svg'
// import UploadIcon from '../assets/icons/Upload.svg'
// import GitHubIcon from '@mui/icons-material/GitHub'
import ProjectPanel from './ProjectPanel/ProjectPanel'
import Sheenstock from '../assets/icons/projects/Sheenstock.svg'
import SaveIcon from '../assets/icons/Save.svg'
import FolderIcon from '../assets/icons/Folder.svg'


const Icon = () => {
  const projectMode = useStore((state) => state.projectMode)
  return (
    <>
      {projectMode === 'Sample projects' && <Sheenstock/> }
      {projectMode === 'Save project' && <SaveIcon/> }
      {projectMode === 'Open project' && <FolderIcon/> }
    </>

  )
}
/**
 * Displays model open dialog.
 *
 * @return {React.ReactElement}
 */
export default function OpenModelControl({fileOpen, modelPath, isLocalModel}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const [orgNamesArr, setOrgNamesArray] = useState([''])
  const {user} = useAuth0()
  const accessToken = useStore((state) => state.accessToken)
  useEffect(() => {
    /**
     * Asynchronously fetch organizations
     *
     * @return {Array} organizations
     */
    async function fetchOrganizations() {
      const orgs = await getOrganizations(accessToken)
      const orgNamesFetched = Object.keys(orgs).map((key) => orgs[key].login)
      const orgNames = [...orgNamesFetched, user && user.nickname]
      setOrgNamesArray(orgNames)
      return orgs
    }

    if (accessToken) {
      fetchOrganizations()
    }
  }, [accessToken, user])


  return (
    <Box>
      <TooltipIconButton
        title={'Projects'}
        showTitle={false}
        onClick={() => setIsDialogDisplayed(true)}
        icon={<OpenIcon/>}
        placement={'bottom'}
        selected={isDialogDisplayed}
        dataTestId='open-ifc'
      />
      {isDialogDisplayed &&
        <OpenModelDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
          fileOpen={fileOpen}
          modelPath={modelPath}
          isLocalModel={isLocalModel}
          orgNamesArr={orgNamesArr}
        />
      }
    </Box>
  )
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function OpenModelDialog({isDialogDisplayed, setIsDialogDisplayed, fileOpen, orgNamesArr, modelPath, isLocalModel}) {
  const openFile = () => {
    fileOpen()
    setIsDialogDisplayed(false)
  }
  const projectMode = useStore((state) => state.projectMode)

  return (
    <Dialog
      icon={<Icon/>}
      headerText={projectMode}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'Import'}
      showActionButton={false}
      actionIcon={<Icon/>}
      actionCb={openFile}
      content={
        <ProjectPanel fileOpen={fileOpen} modelPathDefined={modelPath} isLocalModel={isLocalModel}/>
      }
    />
  )
}

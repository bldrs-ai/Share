import React, {ReactElement, useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {useAuth0} from '@auth0/auth0-react'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
// import FormControl from '@mui/material/FormControl'
// import FormHelperText from '@mui/material/FormHelperText'
// import IconButton from '@mui/material/Button'
// import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
// import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {checkOPFSAvailability} from '../../OPFS/utils'
import {getFiles} from '../../net/github/Files'
import {getOrganizations} from '../../net/github/Organizations'
import {getRepositories, getUserRepositories} from '../../net/github/Repositories'
import useStore from '../../store/useStore'
import {handleBeforeUnload} from '../../utils/event'
import {loadLocalFile, loadLocalFileFallback} from '../../utils/loader'
import {ControlButtonWithHashState} from '../Buttons'
import Dialog from '../Dialog'
import PleaseLogin from './PleaseLogin'
import Selector from './Selector'
// import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'


/**
 * Displays Open Model dialog
 *
 * @return {ReactElement}
 */
export default function OpenModelControl() {
  const accessToken = useStore((state) => state.accessToken)

  const isOpenModelVisible = useStore((state) => state.isOpenModelVisible)
  const setIsOpenModelVisible = useStore((state) => state.setIsOpenModelVisible)

  const [orgNamesArr, setOrgNamesArray] = useState([''])

  const {user} = useAuth0()
  const navigate = useNavigate()


  useEffect(() => {
    /** Asynchronously fetch organizations */
    async function fetchOrganizations() {
      const orgs = await getOrganizations(accessToken)
      const orgNamesFetched = Object.keys(orgs).map((key) => orgs[key].login)
      const orgNames = [...orgNamesFetched, user && user.nickname]
      setOrgNamesArray(orgNames)
    }

    if (accessToken) {
      fetchOrganizations()
    }
  }, [accessToken, user])


  return (
    <ControlButtonWithHashState
      title='Open'
      icon={<FolderOpenOutlinedIcon className='icon-share'/>}
      isDialogDisplayed={isOpenModelVisible}
      setIsDialogDisplayed={setIsOpenModelVisible}
      hashPrefix={OPEN_MODEL_PREFIX}
      placement='bottom'
    >
      <OpenModelDialog
        isDialogDisplayed={isOpenModelVisible}
        setIsDialogDisplayed={setIsOpenModelVisible}
        navigate={navigate}
        orgNamesArr={orgNamesArr}
      />
    </ControlButtonWithHashState>
  )
}


/** The prefix to use for the OpenModel state tokens, 'f' for files */
export const OPEN_MODEL_PREFIX = 'om'


/**
 * @property {boolean} isDialogDisplayed Passed to dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to dialog to be controlled
 * @property {Function} navigate Callback from CadView to change page url
 * @property {Array<string>} orgNamesArr List of org names for the current user.
 * @return {ReactElement}
 */
function OpenModelDialog({
  isDialogDisplayed,
  setIsDialogDisplayed,
  navigate,
  orgNamesArr,
}) {
  const {isAuthenticated, user} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const [currentTab, setCurrentTab] = useState('Open')
  const [samplesExpanded, setSamplesExpanded] = useState(true)
  const [saveActionsExpanded, setSaveActionsExpanded] = useState(true)
  const [saveAction, setSaveAction] = useState('version')
  const accessToken = useStore((state) => state.accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const fileName = filesArr[selectedFileName]
  const appPrefix = useStore((state) => state.appPrefix)
  const isOPFSAvailable = checkOPFSAvailability()

  const openFile = () => {
    if (isOPFSAvailable) {
      loadLocalFile(navigate, appPrefix, handleBeforeUnload, false)
    } else {
      loadLocalFileFallback(navigate, appPrefix, handleBeforeUnload, false)
    }
    setIsDialogDisplayed(false)
  }
  const selectOrg = async (org) => {
    setSelectedOrgName(org)
    let repos
    if (orgNamesArr[org] === user.nickname) {
      repos = await getUserRepositories(accessToken)
    } else {
      repos = await getRepositories(orgNamesArr[org], accessToken)
    }
    const repoNames = Object.keys(repos).map((key) => repos[key].name)
    setRepoNamesArr(repoNames)
  }
  const selectRepo = async (repo) => {
    setSelectedRepoName(repo)
    const owner = orgNamesArr[selectedOrgName]
    const files = await getFiles(owner, repoNamesArr[repo], accessToken)
    const fileNames = Object.keys(files).map((key) => files[key].name)
    setFilesArr(fileNames)
  }
  const navigateToFile = () => {
    if (filesArr[selectedFileName].includes('.ifc')) {
      navigate({pathname: `/share/v/gh/${orgName}/${repoName}/main/${fileName}`})
    }
  }
  const NavComponent = () => {
    return (
      <Stack
      direction='row'
      justifyContent="center"
      spacing={1}
      sx={{overflow: 'scroll'}}
      >
        <Chip
          label="Open"
          color='primary'
          variant={currentTab === 'Open' ? 'filled' : 'outlined'}
          onClick={() => setCurrentTab('Open')}
        />
        <Chip
          label="Save"
          color='primary'
          variant={currentTab === 'Save' ? 'filled' : 'outlined'}
          onClick={() => setCurrentTab('Save')}
        />
        <Chip
          label="Delete"
          color='primary'
          variant={currentTab === 'Delete' ? 'filled' : 'outlined'}
          onClick={() => setCurrentTab('Delete')}
        />
      </Stack>
    )
  }
  const LocationComponent = () => {
    return (
      <Stack>
         <Selector
             label='Organization'
             list={orgNamesArrWithAt}
             selected={selectedOrgName}
             setSelected={selectOrg}
         />
           <Selector
             label='Repository'
             list={repoNamesArr}
             selected={selectedRepoName}
             setSelected={selectRepo}
             testId='Repository'
           />
           <Selector
             label='File'
             list={filesArr}
             selected={selectedFileName}
             setSelected={setSelectedFileName}
             testId='File'
           />
            {selectedFileName !== '' &&
            <Box sx={{textAlign: 'center', marginTop: '4px'}}>
              <Button onClick={navigateToFile}>
                Load file
              </Button>
            </Box>
           }
      </Stack>
    )
  }
  const SaveAction = () => {
    return (
      <>
        <Stack
          direction='row'
          justifyContent="center"
          spacing={1}
        >
          <Chip
            label="Save new version"
            onClick={() => setSaveAction('version')}
            variant={saveAction === 'version' ? 'filled' : 'outlined'}
            color='primary'
          />
          <Chip
            label="Save new model"
            onClick={() => setSaveAction('model')}
            variant={saveAction === 'model' ? 'filled' : 'outlined'}
            color='primary'
          />
        </Stack>
        {/* {saveAction === 'version' &&
          <FormControl >
            <Select
              labelId="demo-simple-select-label"
              id="demo-simple-select"
              // value={file}
              size='small'
            >
              <MenuItem value={null}>...</MenuItem>
              <MenuItem value={20}>One</MenuItem>
              <MenuItem value={30}>Two</MenuItem>
              <MenuItem value={40}>Three</MenuItem>
            </Select>
            <FormHelperText>Choose model to version</FormHelperText>
          </FormControl>
        }
        {saveAction === 'model' &&
          <FormControl variant="standard">
          <TextField
            fullWidth
            variant="outlined"
            size="small"
            multiline
            placeholder="Model name"
            helperText='Please include the extension'
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton edge="end" size="small" sx={{border: 'none', width: 20, height: 20}}>
                    <ArrowForwardOutlinedIcon color='primary'/>
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          </FormControl>
        } */}
      </>
    )
  }

  return (
    <Dialog
      headerIcon={<FolderOpenOutlinedIcon className='icon-share'/>}
      headerText='Manage projects'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle='Open local model'
      actionCb={openFile}
    >
      <Stack sx={{padding: '0px 0px 14px 0px'}}>
        <NavComponent/>
      </Stack>

      {currentTab === 'Open' &&
        <Stack>
          <Accordion
    sx={{border: '1px solid lightgrey'}}
            elevation={0}
            expanded={samplesExpanded}
            onChange={() => setSamplesExpanded(!samplesExpanded)}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon/>}
              aria-controls="panel1-content"
              id="panel1-header"
            >
              <Typography variant={'overline'} >
                Sample Projects
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <SampleModelFileSelector
                navigate={navigate}
                setIsDialogDisplayed={setIsDialogDisplayed}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion
    sx={{border: '1px solid lightgrey'}}
            elevation={0}
            expanded={!samplesExpanded}
            onChange={() => setSamplesExpanded(!samplesExpanded)}
          >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon/>}
                aria-controls="panel1-content"
                id="panel1-header"
              >
                <Typography variant={'overline'} >
                  Open your github model
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <LocationComponent/>
              </AccordionDetails>
          </Accordion>
        </Stack>
      }

      {isAuthenticated && currentTab === 'Save' &&
        <Stack spacing={0}>
          <Accordion
            sx={{border: '1px solid lightgrey'}}
            elevation={0}
            expanded={saveActionsExpanded}
            onChange={() => {
              setSaveActionsExpanded(!saveActionsExpanded)
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon/>}
              aria-controls="panel1-content"
              id="panel1-header"
            >
              <Typography variant={'overline'} >
                Choose what to do
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <SaveAction/>
            </AccordionDetails>
          </Accordion>
          <Accordion
          sx={{border: '1px solid lightgrey'}}
          elevation={0}
          expanded={!saveActionsExpanded}
          onChange={() => setSaveActionsExpanded(!saveActionsExpanded)}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon/>}
              aria-controls="panel1-content"
              id="panel1-header"
            >
              <Typography variant={'overline'} >
                {saveAction === 'model' ? 'Choose where to save' : 'Choose the model to version'}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <LocationComponent/>
            </AccordionDetails>
          </Accordion>
        </Stack>
      }

      {isAuthenticated && currentTab === 'Delete' &&
        <Accordion
          sx={{border: '1px solid lightgrey'}}
          elevation={0}
          expanded={true}
        >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon/>}
              aria-controls="panel1-content"
              id="panel1-header"
            >
              <Typography variant={'overline'} >
                Choose model to delete
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <LocationComponent/>
            </AccordionDetails>
        </Accordion>
      }
      {!isAuthenticated &&
          <AccordionDetails>
          <PleaseLogin/>
          </AccordionDetails>
      }

    </Dialog>
  )
}


/**
 * @property {Function} setIsDialogDisplayed callback
 * @return {ReactElement}
 */
function SampleModelFileSelector({navigate, setIsDialogDisplayed}) {
  const [selected, setSelected] = useState('')
  const handleSelect = (e, closeDialog) => {
    setSelected(e.target.value)
    const modelPath = {
      0: '/share/v/gh/bldrs-ai/test-models/main/ifc/Schependomlaan.ifc#c:60.45,-4.32,60.59,1.17,5.93,-3.77',
      1: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
      2: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
      3: '/share/v/gh/Swiss-Property-AG/Eisvogel-Public/main/EISVOGEL.ifc#c:107.36,8.46,156.67,3.52,2.03,16.71',
      4: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
      5: '/share/v/gh/bldrs-ai/test-models/main/ifc/openifcmodels/171210AISC_Sculpture_param.ifc',
      6: '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/main/IFC_STUDY.ifc#c:220.607,-9.595,191.198,12.582,27.007,-21.842',
    }
    window.removeEventListener('beforeunload', handleBeforeUnload)
    navigate({pathname: modelPath[e.target.value]})
    closeDialog()
  }

  return (
    <TextField
      sx={{width: '260px'}}
      value={selected}
      onChange={(e) => handleSelect(e, () => setIsDialogDisplayed(false))}
      variant='outlined'
      label='Select a sample model'
      select
      size='small'
    >
      <MenuItem value={1}>Momentum</MenuItem>
      <MenuItem value={2}>Schneestock</MenuItem>
      <MenuItem value={3}>Eisvogel</MenuItem>
      <MenuItem value={4}>Seestrasse</MenuItem>
      <MenuItem value={0}>Schependomlaan</MenuItem>
      <MenuItem value={5}>Structural Detail</MenuItem>
      <MenuItem value={6}>Bldrs plaza</MenuItem>
    </TextField>
  )
}


import React, {ReactElement, useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {useAuth0} from '@auth0/auth0-react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControl from '@mui/material/FormControl'
import IconButton from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
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
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined'
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
          label="Samples"
          color='primary'
          variant={currentTab === 'Sample' ? 'filled' : 'outlined'}
          onClick={() => setCurrentTab('Sample')}
        />
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
  const LocationComponent = ({save = false}) => {
    return (
      <Stack
        spacing={1}
      >
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
           {!save &&
            <Selector
              label='File'
              list={filesArr}
              selected={selectedFileName}
              setSelected={setSelectedFileName}
              testId='File'
            />
           }
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
            label="New version"
            onClick={() => setSaveAction('version')}
            variant={saveAction === 'version' ? 'filled' : 'outlined'}
            color='primary'
          />
          <Chip
            label="New model"
            onClick={() => setSaveAction('model')}
            variant={saveAction === 'model' ? 'filled' : 'outlined'}
            color='primary'
          />
        </Stack>
      </>
    )
  }

  return (
    <Dialog
      headerIcon={<FolderOpenOutlinedIcon className='icon-share'/>}
      headerText='Projects'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
    >
      <Stack
        spacing={2}
        sx={{paddingBottom: '20px'}}
      >
        <Stack>
          <NavComponent/>
        </Stack>
        {!isAuthenticated && currentTab !== 'Sample' &&
          <Box
          sx={{padding: '40px 0px'}}
          >
            <PleaseLogin/>
          </Box>
        }
        {currentTab === 'Sample' &&
          <Stack
            spacing={1}
            justifyContent={'center'}
            alignContent={'center'}
          >
            <Typography variant={'overline'}>
              Sample Projects
            </Typography>
            <SampleModelFileSelector
                navigate={navigate}
                setIsDialogDisplayed={setIsDialogDisplayed}
            />
          </Stack>
        }

        {isAuthenticated && currentTab === 'Open' &&
            <Stack
            spacing={1}
            >
              <Typography variant={'overline'} >
                Open your github model
              </Typography>
              <LocationComponent/>
              <Typography variant={'overline'} >
                Open model from computer
              </Typography>
            </Stack>
        }
        {currentTab === 'Open' &&
          <Box sx={{padding: '2px 0px'}}>
            <Button onClick={openFile} variant='contained'>
              Open local file
            </Button>
          </Box>
        }

        {isAuthenticated && currentTab === 'Save' &&
          <Stack
            sx={{marginTop: '10px'}}
            spacing={1}
          >
              <SaveAction/>
              <Typography variant={'overline'} >
                {saveAction === 'model' ? 'Choose where to save' : 'Choose Model to version'}
              </Typography>
              <LocationComponent save={saveAction === 'model'}/>
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
          }
          </Stack>
        }

        {isAuthenticated && currentTab === 'Delete' &&
        <Stack
        spacing={1}
        >
          <Typography variant={'overline'} >
            Choose model to delete
          </Typography>
          <LocationComponent/>
        </Stack>
        }
      </Stack>
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
      // sx={{width: '260px'}}
      value={selected}
      onChange={(e) => handleSelect(e, () => setIsDialogDisplayed(false))}
      variant='outlined'
      label='Select a model'
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


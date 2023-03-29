import React, {useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import useTheme from '@mui/styles/useTheme'
import {useAuth0} from '@auth0/auth0-react'
import Dialog from './Dialog'
import {TooltipIconButton} from './Buttons'
import Selector from './Selector'
import useStore from '../store/useStore'
import {handleBeforeUnload} from '../utils/event'
import {getOrganizations, getRepositories, getFiles, getUserRepositories} from '../utils/GitHub'
import {RectangularButton} from '../Components/Buttons'
import OpenIcon from '../assets/icons/Open.svg'
import UploadIcon from '../assets/icons/Upload.svg'


/**
 * Displays model open dialog.
 *
 * @return {React.ReactElement}
 */
export default function OpenModelControl({fileOpen}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const [orgNamesArr, setOrgNamesArray] = useState([''])
  const {user} = useAuth0()
  const theme = useTheme()
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
    <Box
      sx={{
        '& button': {
          margin: '0',
          border: `solid 1px ${theme.palette.primary.background}`,
        },
      }}
    >
      <Paper elevation={0} variant='control'>
        <TooltipIconButton
          title={'Open IFC'}
          onClick={() => setIsDialogDisplayed(true)}
          icon={<OpenIcon/>}
          placement={'right'}
          selected={isDialogDisplayed}
          dataTestId='open-ifc'
        />
      </Paper>
      {isDialogDisplayed &&
        <OpenModelDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
          fileOpen={fileOpen}
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
function OpenModelDialog({isDialogDisplayed, setIsDialogDisplayed, fileOpen, orgNamesArr}) {
  const {isAuthenticated, user} = useAuth0()
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [selectedRepoName, setSelectedRepoName] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [repoNamesArr, setRepoNamesArr] = useState([''])
  const [filesArr, setFilesArr] = useState([''])
  const theme = useTheme()
  const navigate = useNavigate()
  const accessToken = useStore((state) => state.accessToken)
  const orgNamesArrWithAt = orgNamesArr.map((orgName) => `@${orgName}`)
  const orgName = orgNamesArr[selectedOrgName]
  const repoName = repoNamesArr[selectedRepoName]
  const fileName = filesArr[selectedFileName]

  const openFile = () => {
    fileOpen()
    setIsDialogDisplayed(false)
  }

  const selectOrg = async (org) => {
    setSelectedOrgName(org)
    let repos
    if (orgNamesArr[org] === user.nickname) {
      repos = await getUserRepositories(user.nickname, accessToken)
    } else {
      repos = await getRepositories(orgNamesArr[org], accessToken)
    }
    const repoNames = Object.keys(repos).map((key) => repos[key].name)
    setRepoNamesArr(repoNames)
  }

  const selectRepo = async (repo) => {
    setSelectedRepoName(repo)
    const owner = orgNamesArr[selectedOrgName]
    const files = await getFiles(repoNamesArr[repo], owner, accessToken)
    const fileNames = Object.keys(files).map((key) => files[key].name)
    setFilesArr(fileNames)
  }

  const navigateToFile = () => {
    if (filesArr[selectedFileName].includes('.ifc')) {
      navigate({pathname: `/share/v/gh/${orgName}/${repoName}/main/${fileName}`})
    }
  }

  return (
    <Dialog
      icon={<OpenIcon/>}
      headerText={'Open'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'Open local file'}
      actionIcon={<UploadIcon/>}
      actionCb={openFile}
      content={
        <Box
          sx={{
            width: '260px',
            paddingTop: '6px',
            textAlign: 'left',
          }}
        >
          <SampleModelFileSelector setIsDialogDisplayed={setIsDialogDisplayed}/>
          <p>Visit our {' '}
            <a
              target="_blank"
              href='https://github.com/bldrs-ai/Share/wiki/GitHub-model-hosting'
              rel="noreferrer"
            >
              wiki
            </a> to learn more about GitHub hosting.
          </p>
          {isAuthenticated ?
          <Box>
            <Selector label={'Organization'} list={orgNamesArrWithAt} selected={selectedOrgName} setSelected={selectOrg}/>
            <Selector label={'Repository'} list={repoNamesArr} selected={selectedRepoName} setSelected={selectRepo} testId={'Repository'}/>
            <Selector label={'File'} list={filesArr} selected={selectedFileName} setSelected={setSelectedFileName} testId={'File'}/>
            {selectedFileName !== '' &&
              <Box sx={{textAlign: 'center', marginTop: '4px'}}>
                <RectangularButton title={'Load file'} icon={<UploadIcon/>} onClick={navigateToFile}/>
              </Box>
            }
          </Box> :
          <Typography
            variant={'h4'}
            sx={{
              backgroundColor: theme.palette.scene.background,
              borderRadius: '5px',
              padding: '12px',
            }}
          >
            Please login to get access to your files on GitHub
          </Typography>
          }
          <Box
            sx={{
              marginTop: '1em',
              fontSize: '.8em',
            }}
          >
            * Local files cannot yet be saved or shared.
          </Box>
        </Box>
      }
    />
  )
}


/**
 * @property {Function} setIsDialogDisplayed callback
 * @return {React.ReactElement}
 */
function SampleModelFileSelector({setIsDialogDisplayed}) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState('')
  const theme = useTheme()
  const handleSelect = (e, closeDialog) => {
    setSelected(e.target.value)
    const modelPath = {
      0: '/share/v/gh/IFCjs/test-ifc-files/main/Schependomlaan/IFC%20Schependomlaan.ifc#c:60.45,-4.32,60.59,1.17,5.93,-3.77',
      1: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
      2: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
      3: '/share/v/gh/Swiss-Property-AG/Eisvogel-Public/main/EISVOGEL.ifc#c:107.36,8.46,156.67,3.52,2.03,16.71',
      4: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
      // eslint-disable-next-line max-len
      5: '/share/v/gh/sujal23ks/BCF/main/packages/fileimport-service/ifc/ifcs/171210AISC_Sculpture_brep.ifc/120010/120020/120023/4998/2867#c:-163.46,16.12,223.99,12.03,-28.04,-15.28',
      6: '/share/v/gh/OlegMoshkovich/Logo/main/IFC_STUDY.ifc',
    }
    window.removeEventListener('beforeunload', handleBeforeUnload)
    navigate({pathname: modelPath[e.target.value]})
    closeDialog()
  }

  return (
    <TextField
      sx={{
        'width': '260px',
        '& .MuiOutlinedInput-input': {
          color: theme.palette.secondary.main,
        },
        '& .MuiInputLabel-root': {
          color: theme.palette.secondary.main,
        },
        '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.palette.secondary.main,
        },
        '&:hover .MuiOutlinedInput-input': {
          color: theme.palette.secondary.main,
        },
        '&:hover .MuiInputLabel-root': {
          color: theme.palette.secondary.main,
        },
        '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.palette.secondary.main,
        },
        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
          color: theme.palette.secondary.main,
        },
        '& .MuiInputLabel-root.Mui-focused': {
          color: theme.palette.secondary.main,
        },
        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.palette.secondary.main,
        },
      }}
      value={selected}
      onChange={(e) => handleSelect(e, () => setIsDialogDisplayed(false))}
      variant='outlined'
      label='Sample Projects'
      select
      size='small'
    >
      <MenuItem value={1}><Typography variant='p'>Momentum</Typography></MenuItem>
      <MenuItem value={2}><Typography variant='p'>Schneestock</Typography></MenuItem>
      <MenuItem value={3}><Typography variant='p'>Eisvogel</Typography></MenuItem>
      <MenuItem value={4}><Typography variant='p'>Seestrasse</Typography></MenuItem>
      <MenuItem value={0}><Typography variant='p'>Schependomlaan</Typography></MenuItem>
      <MenuItem value={5}><Typography variant='p'>Structural Detail</Typography></MenuItem>
      <MenuItem value={6}><Typography variant='p'>Bldrs plaza</Typography></MenuItem>
    </TextField>
  )
}

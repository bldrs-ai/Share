import React, {useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import debug from '../utils/debug'
import {getBranches} from '../utils/GitHub'
import useStore from '../store/useStore'
import {navigateBaseOnModelPath} from '../utils/location'
import {handleBeforeUnload} from '../utils/event'


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
export default function Branches() {
  const navigate = useNavigate()
  const repository = useStore((state) => state.repository)
  const [branches, setBranches] = useState([])
  const [versionPaths, setVersionPaths] = useState([])
  const [selected, setSelected] = useState(0)
  const modelPath = useStore((state) => state.modelPath)
  const accessToken = useStore((state) => state.accessToken)
  const theme = useTheme()


  useEffect(() => {
    if (!repository) {
      debug().warn('IssuesControl#Issues: 1, no repo defined')
      return
    }
    const fetchBranches = async () => {
      try {
        const branchesData = await getBranches(repository, accessToken)
        const versionPathsTemp = []
        if (branchesData.length > 0) {
          setBranches(branchesData)
        }
        branchesData.map((branch, i) => {
          if (branch.name === modelPath.branch) {
            // select the current branch
            setSelected(i)
          }
          const versionPath = navigateBaseOnModelPath(modelPath.org, modelPath.repo, branch.name, modelPath.filepath)
          versionPathsTemp.push(versionPath)
        })
        setVersionPaths(versionPathsTemp)
      } catch (e) {
        debug().warn('failed to fetch branches', e)
      }
    }

    if (branches.length === 0 && modelPath.repo !== undefined) {
      fetchBranches()
    }
  }, [accessToken, repository, branches.length, modelPath.branch, modelPath.filepath, modelPath.org, modelPath.repo])


  const handleSelect = (event) => {
    const versionNumber = event.target.value
    setSelected(versionNumber)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    navigate({
      pathname: versionPaths[versionNumber],
    })
  }


  return (
    <>
      {branches.length > 1 && modelPath.repo !== undefined &&
        <Paper elevation={0} variant='control'
          sx={{
            marginTop: '34px',
            opacity: .8,
          }}
        >
          <TextField
            sx={{
              'width': '300px',
              '& .MuiOutlinedInput-input': {
                color: theme.palette.primary.contrastText,
              },
              '& .MuiInputLabel-root': {
                color: theme.palette.primary.contrastText,
              },
              '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.primary.main,
              },
              '&:hover .MuiOutlinedInput-input': {
                color: theme.palette.primary.contrastText,
              },
              // TODO(oleg): connect to props
              '&:hover .MuiInputLabel-root': {
                color: theme.palette.primary.contrastText,
              },
              '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.primary.main,
              },
              // TODO(oleg): connect to props
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
                color: theme.palette.primary.contrastText,
              },
              // TODO(oleg): connect to props
              '& .MuiInputLabel-root.Mui-focused': {
                color: theme.palette.primary.contrastText,
              },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.primary.main,
              },
            }}
            onChange={(e) => handleSelect(e)}
            variant='outlined'
            label='Git Branches / Project Versions'
            value={selected}
            select
            role="button"
          >
            {branches.map((branch, i) => {
              return (
                <MenuItem
                  key={i}
                  value={i}
                >
                  <Typography variant='p'>{branch.name}</Typography>
                </MenuItem>
              )
            })
            }
          </TextField>
        </Paper>
      }
    </>
  )
}

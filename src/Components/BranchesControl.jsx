import React, {useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
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
  const isBranches = useStore((state) => state.isBranches)
  const setIsBranches = useStore((state) => state.setIsBranches)
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
        if (branchesData.length > 1) {
          setIsBranches(true)
        } else {
          setIsBranches(false)
        }
      } catch (e) {
        debug().warn('failed to fetch branches', e)
      }
    }

    if (branches.length === 0 && modelPath.repo !== undefined) {
      fetchBranches()
    }
  }, [accessToken, repository, branches.length, modelPath.branch, modelPath.filepath, modelPath.org, modelPath.repo, setIsBranches])

  const handleSelect = (event) => {
    const versionNumber = event.target.value
    setSelected(versionNumber)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    navigate({
      pathname: versionPaths[versionNumber],
    })
  }


  return (
    <Box sx={{width: '100%'}}>
      {isBranches && modelPath.repo !== undefined &&
        <Paper elevation={0} variant='control'
          sx={{
            marginBottom: '10px',
            opacity: .8,
          }}
        >
          <TextField
            sx={{
              'width': '100%',
              '& .MuiOutlinedInput-input': {
                color: theme.palette.primary.contrastText,
                padding: '13px 0px 13px 16px',
              },
              '& .MuiInputLabel-root': {
                color: theme.palette.primary.contrastText,
                opacity: .5,
              },
              '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
                border: 'none',
              },
              '&:hover .MuiOutlinedInput-input': {
                color: theme.palette.primary.contrastText,
              },
              // TODO(oleg): connect to props
              '&:hover .MuiInputLabel-root': {
                color: theme.palette.primary.contrastText,
                opacity: 1,
              },
              '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
                border: 'none',
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
                border: 'none',
              },
            }}
            onChange={(e) => handleSelect(e)}
            variant='outlined'
            label='Versions'
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
    </Box>
  )
}

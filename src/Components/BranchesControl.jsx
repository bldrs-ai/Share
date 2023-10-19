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
            opacity: .9,
            width: '100%',
            marginTop: '20px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: theme.palette.primary.background,
          }}
        >
          <TextField
            sx={{
              'width': '100%',
              'height': '40px', // Set height for the TextField itself
              '& .MuiSelect-select': {
                height: '40px',
                borderRadius: '4px',
                padding: '10px 26px 10px 12px', // Adjust padding to vertically center the content
              },
              '& .MuiOutlinedInput-input': {
                color: theme.palette.primary.contrastText,
              },
              '& .MuiInputLabel-root': {
                color: theme.palette.primary.contrastText,
                marginLeft: '-2px',
              },
              '& .MuiOutlinedInput-root': {
                height: '40px', // Ensure the input field and label together fit within 40px
              },
              '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
                border: 'none',
                // borderBottom: `1px solid ${theme.palette.primary.main}`,
              },
              '&:hover .MuiOutlinedInput-input': {
                color: theme.palette.primary.contrastText,
              },
              '&:hover .MuiInputLabel-root': {
                color: theme.palette.primary.contrastText,
              },
              '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
                border: 'none',
                // borderBottom: `1px solid ${theme.palette.primary.main}`,
              },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
                color: theme.palette.primary.contrastText,
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: theme.palette.primary.contrastText,
              },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
                // borderBottom: `2px solid ${theme.palette.primary.main}`,
                border: 'none',
              },
            }}
            onChange={(e) => handleSelect(e)}
            variant='outlined'
            label={<Typography>BRANCHES</Typography>}
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

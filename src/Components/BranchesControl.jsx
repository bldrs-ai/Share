import React, {useContext, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {TextField, MenuItem, Paper, Typography} from '@mui/material'
import {ColorModeContext} from '../Context/ColorMode'
import debug from '../utils/debug'
import {getBranches} from '../utils/GitHub'
import useStore from '../store/useStore'
import {navigateBaseOnModelPath} from '../utils/location'


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
export default function Branches() {
  const navigate = useNavigate()
  const colorMode = useContext(ColorModeContext)
  const repository = useStore((state) => state.repository)
  const [branches, setBranches] = useState([])
  const [versionPaths, setVersionPaths] = useState([])
  const [selected, setSelected] = useState(0)
  const modelPath = useStore((state) => state.modelPath)

  useEffect(() => {
    if (!repository) {
      debug().warn('IssuesControl#Issues: 1, no repo defined')
      return
    }
    const fetchBranches = async () => {
      try {
        const branchesData = await getBranches(repository)
        const versionPathsTemp = []
        if (branchesData.data.length > 0) {
          setBranches(branchesData.data)
        }
        branchesData.data.map((branch, i) => {
          if (branch.name === modelPath.branch) {
            // select the current branch
            setSelected(i)
          }
          const versionPath = navigateBaseOnModelPath(
              modelPath.org,
              modelPath.repo,
              branch.name,
              modelPath.filepath,
          )
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
  }, [
    repository,
    branches.length,
    modelPath.branch,
    modelPath.filepath,
    modelPath.org,
    modelPath.repo,
  ])

  const handleSelect = (event) => {
    const versionNumber = event.target.value
    setSelected(versionNumber)
    navigate({
      pathname: versionPaths[versionNumber],
    })
  }

  return (
    <>
      {branches.length > 1 && modelPath.repo !== undefined && (
        <Paper
          elevation={0}
          sx={{
            backgroundColor: colorMode.isDay() ? '#E8E8E8' : '#4C4C4C',
            marginTop: '34px',
            opacity: 0.8,
          }}
        >
          <TextField
            sx={(theme) => ({
              'width': '300px',
              '& .MuiOutlinedInput-input': {
                color: theme.palette.highlight.grey,
              },
              '& .MuiInputLabel-root': {
                color: theme.palette.highlight.heaviest,
              },
              '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.primary.main,
              },
              '&:hover .MuiOutlinedInput-input': {
                color: theme.palette.highlight.heaviest,
              },
              // TODO(oleg): connect to props
              '&:hover .MuiInputLabel-root': {
                color: theme.palette.highlight.heaviest,
              },
              '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline':
                {
                  borderColor: theme.palette.primary.main,
                },
              // TODO(oleg): connect to props
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
                color: theme.palette.highlight.maximum,
              },
              // TODO(oleg): connect to props
              '& .MuiInputLabel-root.Mui-focused': {
                color: theme.palette.highlight.heaviest,
              },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline':
                {
                  borderColor: theme.palette.primary.main,
                },
            })}
            onChange={(e) => handleSelect(e)}
            variant='outlined'
            label='Git Branches / Project Versions'
            value={selected}
            select
            role='button'
          >
            {branches.map((branch, i) => {
              return (
                <MenuItem key={i} value={i}>
                  <Typography variant='p'>{branch.name}</Typography>
                </MenuItem>
              )
            })}
          </TextField>
        </Paper>
      )}
    </>
  )
}

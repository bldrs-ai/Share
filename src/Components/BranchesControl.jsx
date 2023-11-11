import React, {useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
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
        <FormControl sx={{minWidth: '100%', marginTop: '14px'}} size="small">
          <InputLabel id="demo-select-small-label">
            <Typography variant='overline'>Branches</Typography>
          </InputLabel>
          <Select
            labelId="demo-select-small-label"
            id="demo-select-small"
            value={selected}
            label={<Typography variant='overline'>Branches</Typography>}
            onChange={handleSelect}
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
          </Select>
        </FormControl>

      }
    </>
  )
}

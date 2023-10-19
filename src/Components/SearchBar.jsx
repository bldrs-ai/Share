import React, {useRef, useEffect, useState} from 'react'
import {useLocation, useNavigate, useSearchParams} from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Autocomplete from '@mui/material/Autocomplete'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import {looksLikeLink, githubUrlOrPathToSharePath} from '../ShareRoutes'
import debug from '../utils/debug'
import {navWithSearchParamRemoved} from '../utils/navigate'
import {handleBeforeUnload} from '../utils/event'
import SearchIcon from '@mui/icons-material/Search'
import useTheme from '@mui/styles/useTheme'


/**
 * Search bar component
 *
 * @property {Function} fileOpen callback for OpenModelControl
 * @return {React.Component}
 */
export default function SearchBar({fileOpen}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [inputText, setInputText] = useState('')
  const [error, setError] = useState('')
  const searchInputRef = useRef(null)
  const theme = useTheme()


  useEffect(() => {
    debug().log('SearchBar#useEffect[searchParams]')
    if (location.search) {
      if (validSearchQuery(searchParams)) {
        const newInputText = searchParams.get(QUERY_PARAM)
        if (inputText !== newInputText) {
          setInputText(newInputText)
        }
      } else {
        window.removeEventListener('beforeunload', handleBeforeUnload)
        navWithSearchParamRemoved(navigate, location.pathname, QUERY_PARAM)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])


  const onSubmit = (event) => {
    // Prevent form event bubbling and causing page reload.
    event.preventDefault()
    if (error.length > 0) {
      setError('')
    }

    // if url is typed into the search bar open the model
    if (looksLikeLink(inputText)) {
      try {
        const modelPath = githubUrlOrPathToSharePath(inputText)
        window.removeEventListener('beforeunload', handleBeforeUnload)
        navigate(modelPath, {replace: true})
      } catch (e) {
        setError(`Please enter a valid url. Click on the LINK icon to learn more.`)
      }
      return
    }

    // Searches from SearchBar clear current URL's IFC path.
    if (containsIfcPath(location)) {
      const newPath = stripIfcPathFromLocation(location)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      navigate({
        pathname: newPath,
        search: `?q=${inputText}`,
      })
    } else {
      setSearchParams({q: inputText})
    }
    searchInputRef.current.blur()
  }


  // The container and paper are set to 100% width to fill the
  // container SearchBar shares with NavPanel.  This is an easier way
  // to have them share the same width, which is now set in the parent
  // container (CadView).
  return (
    <Stack
      justifyContent={'center'}
      alignItems={'center'}
      sx={{width: '100%',
        position: 'absolute',
        top: '1em',
        left: '0em',
        borderRadius: '20px'}}
    >
      <Box
        sx={{
          'width': '300px',
          '@media (max-width: 900px)': {
            width: '240px',
          }}}
      >
        <form onSubmit={onSubmit}>
          <Autocomplete
            freeSolo
            options={['Dach', 'Decke', 'Fen', 'Wand', 'Leuchte', 'Pos', 'Te']}
            value={inputText}
            onChange={(_, newValue) => setInputText(newValue || '')}
            onInputChange={(_, newInputValue) => setInputText(newInputValue || '')}
            inputValue={inputText}
            renderInput={(params) => (
              <TextField
                {...params}
                inputRef={searchInputRef}
                size="small"
                error={!!error.length}
                placeholder='Search'
                variant="outlined"
                sx={{
                  'width': '100%',
                  'borderRadius': '20px',
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '20px', // Ensure the input field also gets the border radius
                    backgroundColor: theme.palette.scene.background,
                  },
                  '& fieldset': {
                    borderRadius: '20px', // Apply border radius to the fieldset as well
                  },
                }}
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{opacity: 0.8, marginLeft: '10px'}} color="secondary"/>
                    </InputAdornment>
                  ),
                }}
              />
            )}
          />
        </form>
      </Box>
    </Stack>
  )
}


/** @type {string} */
export const QUERY_PARAM = 'q'


/**
 * Return true for paths like
 *
 *   /share/v/p/index.ifc/1
 *   /share/v/p/index.ifc/1/2
 *   /share/v/p/index.ifc/1/2/...
 *
 * and false for:
 *
 *   /share/v/p/index.ifc
 *
 * @param {object} location React router location object.
 * @return {boolean}
 */
export function containsIfcPath(location) {
  return location.pathname.match(/.*\.ifc(?:\/[0-9])+(?:.*)/) !== null
}


/**
 * Returns true iff searchParams query is defined with a string value.
 *
 * @param {object} searchParams Object with a QUERY_PARAM(default='q') parameter
 * present and optional string value.
 * @return {boolean}
 */
export function validSearchQuery(searchParams) {
  const value = searchParams.get(QUERY_PARAM)
  return value !== null && value.length > 0
}


/**
 * Converts a path like:
 *
 *   /share/v/p/index.ifc/84/103?q=foo
 *
 * to:
 *
 *   /share/v/p/index.ifc?q=foo
 *
 * @param {object} location React router location object.
 * @param {string} fileExtension defaults to '.ifc' for now.
 * @return {string}
 */
export function stripIfcPathFromLocation(location, fileExtension = '.ifc') {
  const baseAndPathquery = location.pathname.split(fileExtension)
  const expectedPartsCount = 2
  if (baseAndPathquery.length === expectedPartsCount) {
    const base = baseAndPathquery[0]
    let newPath = base + fileExtension
    const pathAndQuery = baseAndPathquery[1].split('?')
    if (pathAndQuery.length === expectedPartsCount) {
      const query = pathAndQuery[1]
      newPath += `?${ query}`
    }
    return newPath
  }
  throw new Error('Expected URL of the form <base>/file.ifc<path>[?query]')
}

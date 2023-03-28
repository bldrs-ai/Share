import React, {useRef, useEffect, useState} from 'react'
import {useLocation, useNavigate, useSearchParams} from 'react-router-dom'
import Box from '@mui/material/Box'
import InputBase from '@mui/material/InputBase'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {looksLikeLink, githubUrlOrPathToSharePath} from '../ShareRoutes'
import debug from '../utils/debug'
import {handleBeforeUnload} from '../utils/event'
import OpenModelControl from './OpenModelControl'
import {TooltipIconButton} from './Buttons'
import ClearIcon from '../assets/icons/Clear.svg'


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
  const onInputChange = (event) => setInputText(event.target.value)
  const searchInputRef = useRef(null)
  // input length is dynamically calculated in order to fit the input string into the Text input
  const widthPerChar = 6.5
  const minWidthPx = 125
  const widthPx = (Number(inputText.length) * widthPerChar) + minWidthPx
  // it is passed into the styles as a property the input width needs to change when the query exceeds the minWidth
  // TODO(oleg): find a cleaner way to achieve this
  const theme = useTheme()


  useEffect(() => {
    debug().log('SearchBar#useEffect[searchParams]')
    if (location.search) {
      if (validSearchQuery(searchParams)) {
        const newInputText = searchParams.get('q')
        if (inputText !== newInputText) {
          setInputText(newInputText)
        }
      } else {
        window.removeEventListener('beforeunload', handleBeforeUnload)
        navigate(location.pathname)
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
    <Box sx={{width: '100%'}}>
      <Paper
        component='form'
        onSubmit={onSubmit}
        elevation={0}
        variant='control'
        sx={{
          'display': 'flex',
          'minWidth': '100%',
          'width': `${widthPx}px`,
          'height': '56px',
          'alignItems': 'center',
          'opacity': .8,
          'padding': '2px 6px',
          '@media (max-width: 900px)': {
            width: '100%',
          },
          '& .MuiInputBase-root': {
            flex: 1,
          },
        }}
      >
        <OpenModelControl fileOpen={fileOpen}/>
        <InputBase
          inputRef={searchInputRef}
          value={inputText}
          onChange={onInputChange}
          error={true}
          placeholder={'Search'}
          sx={{
            ...theme.typography.tree,
            'marginTop': '4px',
            'marginLeft': '14px',
            '& input::placeholder': {
              opacity: .2,
            },
          }}
        />
        {inputText.length > 0 &&
          <TooltipIconButton
            title='clear'
            onClick={() => {
              setInputText('')
              setError('')
            }}
            icon={<ClearIcon/>}
          />
        }
      </Paper>
      { inputText.length > 0 &&
        error.length > 0 &&
        <Box sx={{
          marginLeft: '10px',
          marginTop: '3px',
          fontSize: '10px',
          color: 'red',
        }}
        >{error}
        </Box>
      }
    </Box>
  )
}


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
 * @param {object} searchParams Object with a 'q' parameter and optional string value.
 * @return {boolean}
 */
export function validSearchQuery(searchParams) {
  const value = searchParams.get('q')
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

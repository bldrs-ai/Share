import React, {useRef, useEffect, useState} from 'react'
import {
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import InputBase from '@mui/material/InputBase'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import debug from '../utils/debug'
import Search from '../assets/2D_Icons/Search.svg'
import Hamburger from '../assets/2D_Icons/MenuClear.svg'
import Close from '../assets/2D_Icons/CloseClear.svg'


/**
 * Search bar component
 * @param {function} onClickMenuCb callback
 * @param {boolean} showNavPanel toggle
 * @return {Object} The SearchBar react component
 */
export default function SearchBar({onClickMenuCb, showNavPanel}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [inputText, setInputText] = useState('')
  const onInputChange = (event) => setInputText(event.target.value)
  const searchInputRef = useRef(null)
  const classes = useStyles()


  useEffect(() => {
    debug().log('SearchBar#useEffect[searchParams]')
    if (location.search) {
      if (validSearchQuery(searchParams)) {
        const newInputText = searchParams.get('q')
        if (inputText != newInputText) {
          setInputText(newInputText)
        }
      } else {
        navigate(location.pathname)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])


  const onSubmit = (event) => {
    // Prevent form event bubbling and causing page reload.
    event.preventDefault()

    // Searches from SearchBar clear current URL's IFC path.
    if (containsIfcPath(location)) {
      const newPath = stripIfcPathFromLocation(location)
      navigate({
        pathname: newPath,
        search: `?q=${inputText}`,
      })
    } else {
      setSearchParams({q: inputText})
    }
    searchInputRef.current.blur()
  }

  return (
    <Paper component='form' className={classes.root} onSubmit={onSubmit}>
      <IconButton
        className={classes.iconButton}
        aria-label='menu'
        onClick={onClickMenuCb}>
        {showNavPanel ? <Close className={classes.icon}/> : <Hamburger className={classes.icon}/>}
      </IconButton>
      <InputBase
        inputRef={searchInputRef}
        value={inputText}
        onChange={onInputChange}
        placeholder='Search building'
        inputProps={{'aria-label': 'search'}}
        className={classes.inputBase}
      />
      <IconButton
        type='submit'
        className={classes.iconButton}
        aria-label='search' >
        <Search className={classes.icon}/>
      </IconButton>
    </Paper>
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
 * @param {Object} location React router location object.
 * @return {boolean}
 */
export function containsIfcPath(location) {
  return location.pathname.match(/.*\.ifc(?:\/[0-9])+(?:.*)/) != null
}


/**
 * Returns true iff searchParams query is defined with a string value.
 *
 * @param {Object} searchParams Object with a 'q' parameter and optional string value.
 * @return {boolean}
 */
export function validSearchQuery(searchParams) {
  const value = searchParams.get('q')
  return value != null && value.length > 0
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
 * @param {Object} location React router location object.
 * @param {string} fileExtension defaults to '.ifc' for now.
 * @return {string}
 */
export function stripIfcPathFromLocation(location, fileExtension = '.ifc') {
  const baseAndPathquery = location.pathname.split(fileExtension)
  if (baseAndPathquery.length == 2) {
    const base = baseAndPathquery[0]
    let newPath = base + fileExtension
    const pathAndQuery = baseAndPathquery[1].split('?')
    if (pathAndQuery.length == 2) {
      const query = pathAndQuery[1]
      newPath += '?' + query
    }
    return newPath
  }
  throw new Error('Expected URL of the form <base>/file.ifc<path>[?query]')
}


const useStyles = makeStyles({
  root: {
    'padding': '2px 2px 2px 2px',
    'display': 'flex',
    'alignItems': 'center',
    'width': 300,
    '@media (max-width: 900px)': {
      'padding': '2px 2px 2px 2px',
      'width': 244,
    },
  },
  iconButton: {
    padding: 10,
  },
  icon: {
    width: '30px',
    height: '30px',
  },
  inputBase: {
    'flex': 1,
    '& input': {
      fontSize: '16px',
    },
  },
})

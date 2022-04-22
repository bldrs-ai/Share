import React, {useRef, useEffect, useState} from 'react'
import {
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import InputBase from '@mui/material/InputBase'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import {TooltipToggleButton, FormButton} from './Buttons'
import debug from '../utils/debug'
import {
  looksLikeLink,
  githubUrlOrPathToSharePath,
} from '../ShareRoutes'
import SearchIcon from '../assets/2D_Icons/Search.svg'
import LinkIcon from '../assets/2D_Icons/Link.svg'
import ClearIcon from '../assets/2D_Icons/Close.svg'
import TreeIcon from '../assets/2D_Icons/Tree.svg'


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
  const [error, setError] = useState('')
  const onInputChange = (event) => setInputText(event.target.value)
  const searchInputRef = useRef(null)
  // input length is dynamically calculated in order to fit the input string into the Text input
  const calculatedInputWidth = Number(inputText.length) * 10 + 130
  // it is passed into the styles as a property the input width needs to change when the querry exeeds the minWidth
  // TODO(oleg): find a cleaner way to achieve this
  const classes = useStyles({inputWidth: calculatedInputWidth})

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
    if (error.length > 0) {
      setError('')
    }
    // if url is typed into the search bar open the model
    if (looksLikeLink(inputText)) {
      try {
        const modelPath = githubUrlOrPathToSharePath(inputText)
        navigate(modelPath, {replace: true})
      } catch (e) {
        console.error(e)
        setError(`Please enter a valid url. Click on the LINK icon to learn more.`)
      }
      return
    }

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
    <div>
      <Paper component='form' className={classes.root} onSubmit={onSubmit}>
        <TooltipToggleButton
          placement = 'bottom'
          title='Toggle tree view'
          onClick={onClickMenuCb}
          icon={<TreeIcon/>}/>
        <InputBase
          inputRef={searchInputRef}
          value={inputText}
          onChange={onInputChange}
          error = {true}
          placeholder={'Search model'}/>
        {inputText.length> 0 ?
          <TooltipToggleButton
            title='clear'
            size = 'small'
            placement = 'bottom'
            onClick={()=>{
              setInputText('')
              setError('')
            }}
            icon={<ClearIcon/>}/>:null
        }
        <FormButton
          title='search'
          size = 'small'
          placement = 'bottom'
          icon={<SearchIcon/>}/>
        <TooltipToggleButton
          title={`Enter GitHub URL to access IFCs hosted on GitHub.
                  Click on the link icon to learn more.`}
          size = 'small'
          placement = 'right'
          onClick={()=>{
            window.open('https://github.com/bldrs-ai/Share/wiki/Open-IFC-model-hosted-on-GitHub')
          }}
          icon={<LinkIcon/>}/>
      </Paper>
      { inputText.length>0 &&
        error.length>0 &&
        <div className = {classes.error}>{error}</div>
      }
    </div>
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
    'display': 'flex',
    'minWidth': '300px',
    'width': (props) => props.inputWidth,
    'maxWidth': '700px',
    'alignItems': 'center',
    'padding': '2px 2px 2px 2px',
    '@media (max-width: 900px)': {
      minWidth: '300px',
      width: '300px',
      maxWidth: '300px',
    },
    '& .MuiInputBase-root': {
      flex: 1,
    },
  },
  error: {
    marginLeft: '10px',
    marginTop: '3px',
    fontSize: '10px',
    color: 'red',
  },
})

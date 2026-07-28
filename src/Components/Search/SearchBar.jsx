import React, {ReactElement, useRef, useEffect, useState} from 'react'
import {useLocation, useNavigate, useSearchParams} from 'react-router-dom'
import {Autocomplete, TextField} from '@mui/material'
import {Close as CloseIcon} from '@mui/icons-material'
import {looksLikeLink, githubUrlOrPathToSharePath} from '../../net/github/utils'
import {processExternalUrl} from '../../routes/routes'
import {disablePageReloadApprovalCheck} from '../../utils/event'
import {navWithSearchParamRemoved, navigateToModel} from '../../utils/navigate'
import {assertDefined} from '../../utils/assert'
import {useIsMobile} from '../Hooks'
import {SEARCH_BAR_PLACEHOLDER_TEXT} from './component'


/**
 * The search bar doubles as an input for search queries and also open
 * file paths
 *
 * @property {string} [placeholder] Text to display when search bar is inactive
 * @property {boolean} [isGitHubSearch] Strict screening for GH only links
 * @property {Function} [onSuccess] Optional callback when search succeeds
 * @property {boolean} [fullWidth] Fill the host container instead of the
 *   self-sized widths below — for hosts like the TopBar that own the
 *   layout, where the fixed mobile width overflows the viewport.
 * @property {Function} [onCancel] Called on Escape, and on clearing an
 *   already-empty field — hosts that summon the bar (the TopBar's
 *   anchored search) use it to put it away again.
 * @property {boolean} [takeFocus] Focus the input on mount, for hosts
 *   that render the bar in response to an explicit "open search".
 * @return {ReactElement}
 */
export default function SearchBar({
  placeholder = SEARCH_BAR_PLACEHOLDER_TEXT,
  isGitHubSearch = false,
  onSuccess = null,
  fullWidth = false,
  onCancel = null,
  takeFocus = false,
}) {
  assertDefined(placeholder, isGitHubSearch)
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [inputText, setInputText] = useState('')
  const [error, setError] = useState('')
  const searchInputRef = useRef(null)


  useEffect(() => {
    if (location.search) {
      if (!isGitHubSearch) {
        if (validSearchQuery(searchParams)) {
          const newInputText = searchParams.get(QUERY_PARAM)
          if (inputText !== newInputText) {
            setInputText(newInputText)
          }
        } else {
          disablePageReloadApprovalCheck()
          navWithSearchParamRemoved(navigate, location.pathname, QUERY_PARAM)
        }
      }
    } else {
      setInputText('')
      navWithSearchParamRemoved(navigate, location.pathname, QUERY_PARAM)
    }
    // TODO(pablo): we only care about the final state when searchParams change,
    // but probably missing some validation state
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
        disablePageReloadApprovalCheck()
        navigateToModel(modelPath, navigate)
        if (onSuccess) {
          onSuccess()
        }
      } catch (e) {
        setError(`Please enter a valid url. Click on the LINK icon to learn more.`)
      }
      return
    }

    const result = processExternalUrl(window.location.href, inputText)
    if (result) {
      try {
        disablePageReloadApprovalCheck()
        navigate(`/share/v/u/${inputText}`)
        if (onSuccess) {
          onSuccess()
        }
      } catch (e) {
        setError(`Please enter a valid url.`)
      }
      return
    }


    // Searches from SearchBar clear current URL's IFC path. Existing
    // params (feature flags in particular) ride along — replacing the
    // whole query string here ejected workspace users from the shell
    // on their first search.
    if (containsIfcPath(location)) {
      const newPath = stripIfcPathFromLocation(location)
      const sp = new URLSearchParams(location.search)
      sp.set(QUERY_PARAM, inputText)
      disablePageReloadApprovalCheck()
      navigate({
        pathname: newPath,
        search: `?${sp.toString()}`,
      })
    } else {
      // Not the functional updater form — that needs react-router 6.4+
      // and this repo pins 6.3, where a function argument serializes
      // into a garbage query string.
      const sp = new URLSearchParams(location.search)
      sp.set(QUERY_PARAM, inputText)
      setSearchParams(sp)
      if (onSuccess) {
        onSuccess()
      }
    }
    searchInputRef.current.blur()
  }

  // Summoned bars start focused: the user asked for the field, so
  // making them click it too is a wasted interaction.
  useEffect(() => {
    if (takeFocus) {
      searchInputRef.current?.focus()
    }
  }, [takeFocus])

  const twoButtonWidth = '120px'
  const isMobile = useIsMobile()
  // The container and paper are set to 100% width to fill the
  // container SearchBar shares with NavTreePanel.  This is an easier
  // way to have them share the same width, which is now set in the
  // parent container (CadView).
  return (
    <form
      onSubmit={onSubmit}
      style={{
        minWidth: fullWidth ? 0 : '10em',
        width: fullWidth ? '100%' : (isMobile ? `calc(100vw - ${twoButtonWidth})` : '25em'),
      }}
    >
      <Autocomplete
        freeSolo
        options={['Dach', 'Decke', 'Fen', 'Wand', 'Leuchte', 'Pos', 'Te']}
        value={inputText}
        onChange={(_, newValue) => setInputText(newValue || '')}
        onInputChange={(_, newInputValue) => setInputText(newInputValue || '')}
        clearIcon={<CloseIcon className='icon-share'/>}
        inputValue={inputText}
        renderInput={(params) => (
          <TextField
            {...params}
            inputRef={searchInputRef}
            size='small'
            error={!!error.length}
            placeholder={placeholder}
            variant='outlined'
            sx={{
              width: '100%',
            }}
            fullWidth
            onKeyDown={(event) => {
              if (event.key === 'Escape' && onCancel) {
                event.stopPropagation()
                onCancel()
              }
            }}
            data-testid='textfield-search-query'
          />
        )}
      />
    </form>
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

import React from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import SearchIcon from '@mui/icons-material/Search'


/**
 * Button and url hash state to control the SearchBar
 *
 * @return {React.ReactElement}
 */
export default function SearchControl() {
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  const setIsSearchBarVisible = useStore((state) => state.setIsSearchBarVisible)
  return (
    <ControlButtonWithHashState
      title='Search'
      icon={<SearchIcon className='icon-share'/>}
      hashPrefix={SEARCH_PREFIX}
      isDialogDisplayed={isSearchBarVisible}
      setIsDialogDisplayed={setIsSearchBarVisible}
      placement='bottom'
    />
  )
}


/** The prefix to use for the search state token */
export const SEARCH_PREFIX = 's'

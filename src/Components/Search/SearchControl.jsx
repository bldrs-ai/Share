import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {HASH_PREFIX_SEARCH} from './hashState'
import SearchIcon from '@mui/icons-material/Search'


/**
 * Button and url hash state to control the SearchBar
 *
 * @return {ReactElement}
 */
export default function SearchControl() {
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  const setIsSearchBarVisible = useStore((state) => state.setIsSearchBarVisible)
  return (
    <ControlButtonWithHashState
      title='Search'
      icon={<SearchIcon className='icon-share'/>}
      hashPrefix={HASH_PREFIX_SEARCH}
      isDialogDisplayed={isSearchBarVisible}
      setIsDialogDisplayed={setIsSearchBarVisible}
      placement='bottom'
    />
  )
}

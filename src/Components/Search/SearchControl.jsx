import React from 'react'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import SearchIcon from '@mui/icons-material/Search'


/**
 * Initializes search and hosts the SearchBar
 *
 * @property {object} model The model to search
 * @property {object} rootElt The model root elt
 * @return {React.ReactElement}
 */
export default function SearchControl() {
  const toggleIsSearchBarVisible = useStore((state) => state.toggleIsSearchBarVisible)
  return (
    <TooltipIconButton
      title='Search'
      icon={<SearchIcon className='icon-share'/>}
      onClick={toggleIsSearchBarVisible}
    />
  )
}

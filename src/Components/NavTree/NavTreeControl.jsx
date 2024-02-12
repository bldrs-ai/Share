import React, {useEffect} from 'react'
import {useLocation} from 'react-router'
import useStore from '../../store/useStore'
import {addHashParams, getHashParams, removeHashParams} from '../../utils/location'
import {TooltipIconButton} from '../Buttons'
import TreeIcon from '../../assets/icons/Tree.svg'


/**
 * The TooltipIconButton in the ControlsGroup to control display of NavTree.
 *
 * @return {React.ReactElement}
 */
export default function NavTreeControl() {
  const isNavTreeVisible = useStore((state) => state.isNavTreeVisible)
  const setIsNavTreeVisible = useStore((state) => state.setIsNavTreeVisible)

  const location = useLocation()
  useEffect(() => {
    setIsNavTreeVisible(getHashParams(location, NAVTREE_PREFIX) !== undefined)
  }, [location, setIsNavTreeVisible])


  return (
    <TooltipIconButton
      title='Navigation'
      icon={<TreeIcon className='icon-share'/>}
      onClick={() => handleNavigation(isNavTreeVisible)}
    />
  )
}


/** Toggle NavTree visibility and set its state token */
export function handleNavigation(isNavTreeVisible) {
  if (isNavTreeVisible) {
    removeHashParams(window.location, NAVTREE_PREFIX)
  } else {
    addHashParams(window.location, NAVTREE_PREFIX)
  }
}


/** The prefix to use for the NavTree state tokens */
export const NAVTREE_PREFIX = 'n'

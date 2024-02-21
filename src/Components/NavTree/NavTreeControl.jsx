import React from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import TreeIcon from '../../assets/icons/Tree.svg'


/**
 * Button and url hash state to control the NavTree
 *
 * @return {React.ReactElement}
 */
export default function NavTreeControl() {
  const isNavTreeVisible = useStore((state) => state.isNavTreeVisible)
  const setIsNavTreeVisible = useStore((state) => state.setIsNavTreeVisible)
  return (
    <ControlButtonWithHashState
      title='Navigation'
      icon={<TreeIcon className='icon-share'/>}
      isDialogDisplayed={isNavTreeVisible}
      setIsDialogDisplayed={setIsNavTreeVisible}
      hashPrefix={NAVTREE_PREFIX}
      placement='bottom'
    />
  )
}


/** The prefix to use for the NavTree state tokens */
export const NAVTREE_PREFIX = 'n'

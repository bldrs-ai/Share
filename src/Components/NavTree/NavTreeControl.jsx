import React from 'react'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import TreeIcon from '../../assets/icons/Tree.svg'


/**
 * The TooltipIconButton in the ControlsGroup to control display of NavTree.
 *
 * @return {React.ReactElement}
 */
export default function NavTreeControl() {
  const toggleIsNavTreeVisible = useStore((state) => state.toggleIsNavTreeVisible)
  return (
    <TooltipIconButton
      title='Navigation'
      icon={<TreeIcon className='icon-share'/>}
      onClick={toggleIsNavTreeVisible}
    />
  )
}

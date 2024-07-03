import React, {ReactElement, useEffect, useState} from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {HASH_PREFIX_NAV_TREE} from './hashState'
import TreeIcon from '../../assets/icons/Tree.svg'


/**
 * Button and url hash state to control the NavTree
 *
 * @return {ReactElement}
 */
export default function NavTreeControl() {
  const isNavTreeVisible = useStore((state) => state.isNavTreeVisible)
  const setIsNavTreeVisible = useStore((state) => state.setIsNavTreeVisible)
  const selectedElements = useStore((state) => state.selectedElements)

  const [lastNumSelected, setLastNumSelected] = useState(0)

  // Open NavTree on selection
  useEffect(() => {
    if (lastNumSelected === 0 && selectedElements.length > 0) {
      setIsNavTreeVisible(true)
    }
    setLastNumSelected(selectedElements.length)
  }, [lastNumSelected, setLastNumSelected, selectedElements, setIsNavTreeVisible])

  return (
    <ControlButtonWithHashState
      title='Nav'
      icon={<TreeIcon className='icon-share'/>}
      isDialogDisplayed={isNavTreeVisible}
      setIsDialogDisplayed={setIsNavTreeVisible}
      hashPrefix={HASH_PREFIX_NAV_TREE}
      placement='bottom'
    />
  )
}

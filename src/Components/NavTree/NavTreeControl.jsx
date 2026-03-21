import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {HASH_PREFIX_NAV_TREE} from './hashState'
import {List as ListIcon} from 'lucide-react'


/**
 * Button and url hash state to control the NavTree
 *
 * @return {ReactElement}
 */
export default function NavTreeControl() {
  const isNavTreeVisible = useStore((state) => state.isNavTreeVisible)
  const setIsNavTreeVisible = useStore((state) => state.setIsNavTreeVisible)
  return (
    <ControlButtonWithHashState
      title='Navigation'
      icon={<ListIcon size={18} strokeWidth={1.75}/>}
      isDialogDisplayed={isNavTreeVisible}
      setIsDialogDisplayed={setIsNavTreeVisible}
      hashPrefix={HASH_PREFIX_NAV_TREE}
      placement='right'
    />
  )
}

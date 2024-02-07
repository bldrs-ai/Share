import React from 'react'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import PropertiesIcon from '@mui/icons-material/FormatListBulleted'


/**
 * Initializes properties and hosts the PropertiesBar
 *
 * @property {object} model The model to properties
 * @property {object} rootElt The model root elt
 * @return {React.ReactElement}
 */
export default function PropertiesControl() {
  const toggleIsPropertiesVisible = useStore((state) => state.toggleIsPropertiesVisible)
  return (
    <TooltipIconButton
      title='Properties'
      icon={<PropertiesIcon className='icon-share'/>}
      onClick={toggleIsPropertiesVisible}
    />
  )
}

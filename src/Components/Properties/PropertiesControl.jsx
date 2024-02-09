import React, {useEffect} from 'react'
import {useLocation} from 'react-router'
import useStore from '../../store/useStore'
import {addHashParams, getHashParams, removeHashParams} from '../../utils/location'
import {TooltipIconButton} from '../Buttons'
import PropertiesIcon from '@mui/icons-material/FormatListBulleted'


/**
 * Toggles the visibility of Properties and sets/removes its URL state token
 *
 * @return {React.ReactElement}
 */
export default function PropertiesControl() {
  const isPropertiesVisible = useStore((state) => state.isPropertiesVisible)
  const setIsPropertiesVisible = useStore((state) => state.setIsPropertiesVisible)

  const location = useLocation()
  useEffect(() => {
    setIsPropertiesVisible(getHashParams(location, PROPERTIES_PREFIX) !== undefined)
  }, [location, setIsPropertiesVisible])


  /** Toggle properties visibility and set url state token */
  function onPropertiesClick() {
    // TODO(pablo): useNavigate
    if (isPropertiesVisible) {
      removeHashParams(window.location, PROPERTIES_PREFIX)
    } else {
      addHashParams(window.location, PROPERTIES_PREFIX)
    }
  }


  return (
    <TooltipIconButton
      title='Properties'
      icon={<PropertiesIcon className='icon-share'/>}
      onClick={onPropertiesClick}
      selected={isPropertiesVisible}
    />
  )
}


/** The prefix to use for the properties state tokens */
export const PROPERTIES_PREFIX = 'p'

import React from 'react'
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faEye, faEyeSlash, faGlasses} from '@fortawesome/free-solid-svg-icons'
import useStore from '../store/useStore'
import IfcIsolator from '../Infrastructure/IfcIsolator'


/**
 * @param {IfcIsolator} The IFC isoaltor
 * @param {number} IFC element id
 * @return {object} React component
 */
export default function HideIcon({elementId}) {
  const isHidden = useStore((state) => state.hiddenElements[elementId])
  const updateHiddenStatus = useStore((state) => state.updateHiddenStatus)
  const isIsolated = useStore((state) => state.isolatedElements[elementId])
  const isTempIsolationModeOn = useStore((state) => state.isTempIsolationModeOn)
  const viewer = useStore((state) => state.viewerStore)

  const toggleHide = () => {
    const toBeHidden = viewer.isolator.flattenChildren(elementId)
    if (!isHidden) {
      viewer.isolator.hideElementsById(toBeHidden)
      if (!Number.isInteger(elementId)) {
        updateHiddenStatus(elementId, true)
      }
    } else {
      viewer.isolator.unHideElementsById(toBeHidden)
      if (!Number.isInteger(elementId)) {
        updateHiddenStatus(elementId, false)
      }
    }
  }

  const iconStyle = {float: 'right', margin: '4px', opacity: 0.7}
  if (isTempIsolationModeOn) {
    iconStyle.pointerEvents = 'none'
    if (!isIsolated) {
      iconStyle.opacity = 0.4
    }
  }

  const icon = isIsolated ? faGlasses : (!isHidden ? faEye : faEyeSlash)
  return <FontAwesomeIcon data-testid='hide-icon' style={iconStyle} onClick={toggleHide} icon={icon}/>
}

import React, {ReactElement} from 'react'
import useStore from '../store/useStore'
import IfcIsolator from '../viewer/three/IfcIsolator'
import {Visibility as VisibilityIcon, VisibilityOff as VisibilityOffIcon} from '@mui/icons-material'
import GlassesIcon from '../assets/icons/Glasses.svg'


/**
 * @param {IfcIsolator} The IFC isoaltor
 * @param {number} IFC element id
 * @param {Array<number>} [occurrencePath] STEP occurrence path of the node, if any
 * @return {ReactElement}
 */
export default function HideToggleButton({elementId, occurrencePath = null}) {
  const isHidden = useStore((state) => state.hiddenElements[elementId])
  const updateHiddenStatus = useStore((state) => state.updateHiddenStatus)
  const isIsolated = useStore((state) => state.isolatedElements[elementId])
  const isTempIsolationModeOn = useStore((state) => state.isTempIsolationModeOn)
  const viewer = useStore((state) => state.viewer)

  const toggleHide = () => {
    // STEP: hide this occurrence's own geometry instances. Hiding by expressID
    // would hit the shared product_definition_shape and vanish every reuse of
    // the part (the reported "eye does nothing / H hides both"); resolving the
    // occurrence path to instances hides only this node's placement. The
    // isolator syncs the store, so the eye toggles without updateHiddenStatus.
    if (Array.isArray(occurrencePath) && occurrencePath.length > 0 &&
        typeof viewer.getInstanceIdsForOccurrencePath === 'function') {
      if (!isHidden) {
        viewer.isolator.hideOccurrence(
          elementId, viewer.getInstanceIdsForOccurrencePath(0, occurrencePath))
      } else {
        viewer.isolator.unHideOccurrence(elementId)
      }
      return
    }
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

  const iconStyle = {
    float: 'right',
    marginTop: '2px',
    height: '20px',
    opacity: 0.3,
  }
  if (isTempIsolationModeOn) {
    iconStyle.pointerEvents = 'none'
    if (isIsolated) {
      iconStyle.opacity = 1
      iconStyle.width = '27px'
    }
  }

  if (isIsolated) {
    return <GlassesIcon style={iconStyle} className='icon-share icon-nav-glasses'/>
  } else if (!isHidden) {
    return (
      <VisibilityIcon
        onClick={toggleHide}
        className='icon-share icon-nav-eye'
        style={iconStyle}
        data-testid='hide-icon'
      />
    )
  } else {
    return (
      <VisibilityOffIcon
        onClick={toggleHide}
        className='icon-share icon-nav-eye'
        data-testid='unhide-icon'
        style={iconStyle}
        fill={undefined}
      />
    )
  }
}

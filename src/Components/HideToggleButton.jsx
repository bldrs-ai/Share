import React, {ReactElement} from 'react'
import {Eye, EyeOff, Glasses} from 'lucide-react'
import useStore from '../store/useStore'


/**
 * @param {number} elementId IFC element id
 * @return {ReactElement}
 */
export default function HideToggleButton({elementId}) {
  const isHidden = useStore((state) => state.hiddenElements[elementId])
  const updateHiddenStatus = useStore((state) => state.updateHiddenStatus)
  const isIsolated = useStore((state) => state.isolatedElements[elementId])
  const isTempIsolationModeOn = useStore((state) => state.isTempIsolationModeOn)
  const viewer = useStore((state) => state.viewer)

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

  const style = {
    float: 'right',
    marginTop: '2px',
    opacity: 0.2,
    cursor: 'pointer',
    ...(isTempIsolationModeOn ? {pointerEvents: 'none'} : {}),
    ...(isIsolated ? {opacity: 0.8} : {}),
  }

  if (isIsolated) {
    return <Glasses size={14} strokeWidth={1.5} style={style}/>
  } else if (!isHidden) {
    return (
      <Eye
        size={14}
        strokeWidth={1.5}
        onClick={toggleHide}
        style={style}
        data-testid='hide-icon'
      />
    )
  } else {
    return (
      <EyeOff
        size={14}
        strokeWidth={1.5}
        onClick={toggleHide}
        style={{...style, opacity: 0.5}}
        data-testid='unhide-icon'
      />
    )
  }
}

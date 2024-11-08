// MarkerControl.jsx

import React, {useEffect, useCallback} from 'react'
import PropTypes from 'prop-types'
import usePlaceMark from '../../hooks/usePlaceMark'
import debug from '../../utils/debug'
import useStore from '../../store/useStore'

// eslint-disable-next-line react/display-name
const MarkerControl = React.memo(({context, oppositeObjects, postProcessor}) => {
  const {createPlaceMark, onSceneDoubleTap, onSceneSingleTap} = usePlaceMark()
  const placeMark = useStore((state) => state.placeMark)
  const isNotesVisible = useStore((state) => state.isNotesVisible)

  // Memoize event handlers to ensure they don’t trigger re-renders
  const handleSceneDoubleTap = useCallback(onSceneDoubleTap, [onSceneDoubleTap])
  const handleSceneSingleTap = useCallback(onSceneSingleTap, [onSceneSingleTap])

  // Toggle visibility of all placemarks based on isNotesVisible
  useEffect(() => {
    if (!placeMark) {
        return
    }

    placeMark.getPlacemarks().forEach((placemark_) => {
      placemark_.visible = isNotesVisible
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotesVisible])

  // Initialize PlaceMark instance and set up event listeners only once
  useEffect(() => {
    if (!context) {
      debug().error('MarkerControl: context is undefined')
      return
    }

    if (placeMark) {
        return
    }

    // Initialize PlaceMark and start render loop only once
    const _placeMark = createPlaceMark({context, oppositeObjects, postProcessor})

    const domElement = context.getDomElement()
    domElement.addEventListener('dblclick', handleSceneDoubleTap)
    domElement.addEventListener('click', handleSceneSingleTap)

    // Only start render loop once
    _placeMark.onRender()

    return () => {
      domElement.removeEventListener('dblclick', handleSceneDoubleTap)
      domElement.removeEventListener('click', handleSceneSingleTap)

      // Dispose of PlaceMark instance
      /* if (placeMarkInstance) {
        placeMarkInstance.disposePlaceMarks();
      }*/
    }
  })

  return null
})

MarkerControl.propTypes = {
  context: PropTypes.object.isRequired,
  oppositeObjects: PropTypes.array.isRequired,
  postProcessor: PropTypes.object,
}

export default MarkerControl

import {useEffect} from 'react'
import {Vector3} from 'three'
import {useDoubleTap} from 'use-double-tap'
import debug from '../utils/debug'
import useStore from '../store/useStore'
import PlaceMark from '../Infrastructure/PlaceMark'
import {addHashParams, getHashParams, getObjectParams} from '../utils/location'
import {PLACE_MARK_PREFIX} from '../utils/constants'
import {floatStrTrim} from '../utils/strings'
import {roundCoord} from '../utils/math'


/**
 * Place Mark Hook
 *
 * @return {Function}
 */
export function usePlaceMark() {
  const placeMark = useStore((state) => state.placeMark)
  const setPlaceMark = useStore((state) => state.setPlaceMark)
  const placeMarkId = useStore((state) => state.placeMarkId)
  const setPlaceMarkId = useStore((state) => state.setPlaceMarkId)
  const setPlaceMarkActivated = useStore((state) => state.setPlaceMarkActivated)


  const createPlaceMark = ({context, oppositeObjects}) => {
    const newPlaceMark = new PlaceMark({context})
    newPlaceMark.setObjects(oppositeObjects)
    debug().log('usePlaceMark#createPlaceMark: newPlaceMark: ', newPlaceMark)
    setPlaceMark(newPlaceMark)
  }


  const onSceneDoubleTap = useDoubleTap((event) => {
    debug().log('usePlaceMark#onSceneDoubleTap: ', event)
  })


  const onSceneSingleTap = (event, callback) => {
    if (event.shiftKey) {
      dropPlaceMark(event)
      deactivatePlaceMark()
      callback()
    }
  }


  const togglePlaceMarkActive = (id) => {
    if (placeMark) {
      if (placeMarkId === id && placeMark.activated) {
        deactivatePlaceMark()
      } else {
        activatePlaceMark()
      }
    }
    setPlaceMarkId(id)
  }


  useEffect(() => {
    // TODO(Ron): Put down all place marks
    const placeMarkHash = getHashParams(location, PLACE_MARK_PREFIX)
    if (placeMarkHash && placeMark) {
      debug().log('usePlaceMark: placeMarkHash: ', placeMarkHash)
      const markArr = getObjectParams(placeMarkHash)
      debug().log('usePlaceMark: markArr: ', markArr)
      placeMark.putDown({
        point: new Vector3(
            floatStrTrim(markArr[0]),
            floatStrTrim(markArr[1]),
            floatStrTrim(markArr[2]),
        ),
      })
    }
  }, [placeMark])


  const activatePlaceMark = () => {
    placeMark.activate()
    setPlaceMarkActivated(true)
  }


  const deactivatePlaceMark = () => {
    placeMark.deactivate()
    setPlaceMarkActivated(false)
  }


  const dropPlaceMark = (event) => {
    if (placeMark) {
      const {point} = placeMark.onDrop(event)

      if (point && placeMarkId) {
        const markArr = roundCoord(...point)
        addHashParams(window.location, PLACE_MARK_PREFIX, markArr)
      }
    }
  }


  return {createPlaceMark, onSceneSingleTap, onSceneDoubleTap, togglePlaceMarkActive}
}

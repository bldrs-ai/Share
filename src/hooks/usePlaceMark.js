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
import {addUserDataInGroup} from '../utils/svg'


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
    debug().log('usePlaceMark#onSceneDoubleTap: event: ', event)
  })


  const onSceneSingleTap = async (event, callback) => {
    if (placeMark) {
      const res = placeMark.onSceneClick(event)

      switch (event.button) {
        case 0: // Main button (left button)
          if (event.shiftKey) {
            const {point, promiseGroup} = res

            if (point && promiseGroup && placeMarkId) {
              const svgGroup = await promiseGroup
              debug().log('usePlaceMark#onSceneSingleTap: svgGroup: ', svgGroup)
              const markArr = roundCoord(...point)
              addHashParams(window.location, PLACE_MARK_PREFIX, markArr)
              debug().log('usePlaceMark#onSceneSingleTap: window.location.href: ', window.location.href)
              addUserDataInGroup(svgGroup, {
                url: window.location.href,
              })
            }

            deactivatePlaceMark()
          }
          break
        case 1: // Wheel button (middle button if present)
          break
        // eslint-disable-next-line no-magic-numbers
        case 2: // Secondary button (right button)
          break
        // eslint-disable-next-line no-magic-numbers
        case 3: // Fourth button (back button)
          break
        // eslint-disable-next-line no-magic-numbers
        case 4: // Fifth button (forward button)
          break
        default:
          break
      }

      if (callback) {
        callback(res)
      }
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
      debug().log('usePlaceMark#useEffect: placeMarkHash: ', placeMarkHash)
      const markArr = getObjectParams(placeMarkHash)
      debug().log('usePlaceMark#useEffect: markArr: ', markArr)
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


  return {createPlaceMark, onSceneSingleTap, onSceneDoubleTap, togglePlaceMarkActive}
}

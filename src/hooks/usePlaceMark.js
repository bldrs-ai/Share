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
import {postComment} from '../utils/GitHub'


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
  const repository = useStore((state) => state.repository)
  const notes = useStore((state) => state.notes)
  const setNotes = useStore((state) => state.setNotes)
  const accessToken = useStore((state) => state.accessToken)


  const createPlaceMark = ({context, oppositeObjects}) => {
    const newPlaceMark = new PlaceMark({context})
    newPlaceMark.setObjects(oppositeObjects)
    debug().log('usePlaceMark#createPlaceMark: newPlaceMark: ', newPlaceMark)
    setPlaceMark(newPlaceMark)
  }


  const onSceneDoubleTap = useDoubleTap(async (event) => {
    if (placeMark) {
      const res = placeMark.onSceneDoubleClick(event)

      switch (event.button) {
        case 0: // Main button (left button)
          await dropPlaceMark(res)
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
    }
  })


  const onSceneSingleTap = async (event, callback) => {
    if (placeMark) {
      const res = placeMark.onSceneClick(event)

      switch (event.button) {
        case 0: // Main button (left button)
          if (event.shiftKey) {
            await dropPlaceMark(res)
          } else {
            openData(res)
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


  const dropPlaceMark = async ({point, promiseGroup}) => {
    if (point && promiseGroup && placeMarkId) {
      const svgGroup = await promiseGroup
      debug().log('usePlaceMark#dropPlaceMark: svgGroup: ', svgGroup)
      const markArr = roundCoord(...point)
      addHashParams(window.location, PLACE_MARK_PREFIX, markArr)
      debug().log('usePlaceMark#dropPlaceMark: window.location.href: ', window.location.href)
      addUserDataInGroup(svgGroup, {
        url: window.location.href,
      })
    }

    deactivatePlaceMark()
    if (!repository || !placeMarkId) {
      return
    }
    debug().log('usePlaceMark#dropPlaceMark: `repository` `placeMarkId` condition is passed')
    const placeMarkNote = notes.find((note) => note.id === placeMarkId)
    debug().log('usePlaceMark#dropPlaceMark: notes: ', notes)
    debug().log('usePlaceMark#dropPlaceMark: placeMarkId: ', placeMarkId)
    debug().log('usePlaceMark#dropPlaceMark: placeMarkNote: ', placeMarkNote)
    if (!placeMarkNote) {
      return
    }
    debug().log('usePlaceMark#dropPlaceMark: `placeMarkNote` condition is passed')
    const issueNumber = placeMarkNote.number
    const saveRes = await postComment(repository, issueNumber, {
      body: `[placemark](${window.location.href})`,
    }, accessToken)
    debug().log('usePlaceMark#dropPlaceMark: saveRes: ', saveRes)
    const newNotes = notes.map((note) => {
      if (note.id === placeMarkId) {
        note.numberOfComments = floatStrTrim(note.numberOfComments) + 1
      }
      return note
    })
    setNotes(newNotes)
  }


  const openData = ({url}) => { // Comment in this case
    debug().log('usePlaceMark#openData: url: ', url)
    if (url) {
      window.location.href = url
    }
  }


  return {createPlaceMark, onSceneDoubleTap, onSceneSingleTap, togglePlaceMarkActive}
}

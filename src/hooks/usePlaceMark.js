import {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {useDoubleTap} from 'use-double-tap'
import debug from '../utils/debug'
import useStore from '../store/useStore'
import PlaceMark from '../Infrastructure/PlaceMark'
import {addHashParams, getHashParams, getHashParamsFromUrl, getObjectParams} from '../utils/location'
import {ACTIVE_PLACE_MARK_HEIGHT, INACTIVE_PLACE_MARK_HEIGHT, PLACE_MARK_PREFIX, tempVec3} from '../utils/constants'
import {floatStrTrim, findMarkdownUrls} from '../utils/strings'
import {roundCoord} from '../utils/math'
import {addUserDataInGroup} from '../utils/svg'
import {createComment, getIssueComments} from '../utils/GitHub'
import {arrayDiff} from '../utils/arrays'
import {assertDefined} from '../utils/assert'


const placeMarkGroupMap = new Map()
let renderCount = 0


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
  const toggleSynchNotes = useStore((state) => state.toggleSynchNotes)
  const accessToken = useStore((state) => state.accessToken)
  const location = useLocation()


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
            selectPlaceMark(res)
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
    (async () => {
      if (!Array.isArray(notes) || !repository || !placeMark) {
        return
      }
      debug().log('usePlaceMark#useEffect: renderCount: ', ++renderCount)

      const promises1 = notes.map(async (note) => {
        const issueComments = await getIssueComments(repository, note.number, accessToken)
        let placeMarkUrls = []

        issueComments.forEach((comment) => {
          if (comment.body) {
            const newPlaceMarkUrls = findMarkdownUrls(comment.body, PLACE_MARK_PREFIX)
            placeMarkUrls = placeMarkUrls.concat(newPlaceMarkUrls)
          }
        })

        return placeMarkUrls
      })

      const totalPlaceMarkUrls = (await Promise.all(promises1)).flat()
      debug().log('usePlaceMark#useEffect: totalPlaceMarkUrls: ', totalPlaceMarkUrls)
      const totalPlaceMarkHashUrlMap = new Map()

      totalPlaceMarkUrls.forEach((url) => {
        debug().log('usePlaceMark#useEffect: url: ', url)
        const hash = getHashParamsFromUrl(url, PLACE_MARK_PREFIX)
        totalPlaceMarkHashUrlMap.set(hash, url)
      })

      debug().log('usePlaceMark#useEffect: totalPlaceMarkHashUrlMap: ', totalPlaceMarkHashUrlMap)
      const totalPlaceMarkHashes = Array.from(totalPlaceMarkHashUrlMap.keys())
      debug().log('usePlaceMark#useEffect: totalPlaceMarkHashes: ', totalPlaceMarkHashes)
      const activePlaceMarkHash = getHashParams(location, PLACE_MARK_PREFIX)
      debug().log('usePlaceMark#useEffect: activePlaceMarkHash: ', activePlaceMarkHash)
      const inactivePlaceMarkHashes = totalPlaceMarkHashes.filter((hash) => hash !== activePlaceMarkHash)
      debug().log('usePlaceMark#useEffect: inactivePlaceMarkHashes: ', inactivePlaceMarkHashes)

      if (activePlaceMarkHash) {
        const activeGroup = placeMarkGroupMap.get(activePlaceMarkHash)

        if (activeGroup) {
          setPlaceMarkStatus(activeGroup, true)
        } else {
          // Drop active place mark mesh if it's not existed in scene
          const markArr = getObjectParams(activePlaceMarkHash)
          debug().log('usePlaceMark#useEffect: markArr: ', markArr)
          const svgGroup = await placeMark.putDown({
            point: tempVec3.clone().set(floatStrTrim(markArr[0]), floatStrTrim(markArr[1]), floatStrTrim(markArr[2])),
            fillColor: 'red',
            height: ACTIVE_PLACE_MARK_HEIGHT,
          })
          addUserDataInGroup(svgGroup, {url: window.location.href})
          debug().log('usePlaceMark#useEffect: svgGroup: ', svgGroup)
          placeMarkGroupMap.set(activePlaceMarkHash, svgGroup)
        }
      }

      const promises2 = inactivePlaceMarkHashes.map(async (hash) => {
        const svgGroup = placeMarkGroupMap.get(hash)
        if (svgGroup) {
          setPlaceMarkStatus(svgGroup, false)
        } else {
          // Drop inactive place mark mesh if it's not existed in scene
          const markArr = getObjectParams(hash)
          debug().log('usePlaceMark#useEffect: markArr: ', markArr)
          const newSvgGroup = await placeMark.putDown({
            point: tempVec3.clone().set(floatStrTrim(markArr[0]), floatStrTrim(markArr[1]), floatStrTrim(markArr[2])),
            fillColor: 'black',
            height: INACTIVE_PLACE_MARK_HEIGHT,
          })
          addUserDataInGroup(newSvgGroup, {url: totalPlaceMarkHashUrlMap.get(hash)})
          debug().log('usePlaceMark#useEffect: newSvgGroup: ', newSvgGroup)
          placeMarkGroupMap.set(hash, newSvgGroup)
        }
      })

      await Promise.all(promises2)

      // Remove unnecessary place mark meshes
      const curPlaceMarkHashes = Array.from(placeMarkGroupMap.keys())
      const deletedPlaceMarkHashes = arrayDiff(curPlaceMarkHashes, totalPlaceMarkHashes)
      debug().log('usePlaceMark#useEffect: deletedPlaceMarkHashes: ', deletedPlaceMarkHashes)
      deletedPlaceMarkHashes.forEach((hash) => {
        placeMark.disposePlaceMark(placeMarkGroupMap.get(hash))
      })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])


  const activatePlaceMark = () => {
    placeMark.activate()
    setPlaceMarkActivated(true)
  }


  const deactivatePlaceMark = () => {
    placeMark.deactivate()
    setPlaceMarkActivated(false)
  }


  const dropPlaceMark = async ({point, promiseGroup}) => {
    if (point && promiseGroup) {
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
    if (!repository) {
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
    const saveRes = await createComment(repository, issueNumber, {
      body: `[placemark](${window.location.href})`,
    }, accessToken)
    debug().log('usePlaceMark#dropPlaceMark: saveRes: ', saveRes)
    toggleSynchNotes()
  }


  const selectPlaceMark = (svgGroup) => {
    assertDefined(svgGroup)
    debug().log('usePlaceMark#selectPlaceMark: svgGroup: ', svgGroup)
    if (svgGroup?.userData?.url) {
      // window.location.href = svgGroup.userData.url // Comment to test locally
    }
    setPlaceMarkStatus(svgGroup, true)
  }


  return {createPlaceMark, onSceneDoubleTap, onSceneSingleTap, togglePlaceMarkActive}
}

const setPlaceMarkStatus = (svgGroup, isActive) => {
  assertDefined(svgGroup, isActive)
  svgGroup.userData.isActive = isActive
  resetPlaceMarkColors()
}

const resetPlaceMarkColors = () => {
  // TODO(Ron): Reset place mark colors
  debug().log('usePlaceMark#resetPlaceMarkColors: placeMarkGroupMap: ', placeMarkGroupMap)
}

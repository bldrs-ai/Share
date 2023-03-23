import {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {useDoubleTap} from 'use-double-tap'
import debug from '../utils/debug'
import useStore from '../store/useStore'
import PlaceMark from '../Infrastructure/PlaceMark'
import {addHashParams, getHashParams, getHashParamsFromUrl, getObjectParams, removeHashParams} from '../utils/location'
import {CAMERA_PREFIX, PLACE_MARK_PREFIX, tempVec3} from '../utils/constants'
import {floatStrTrim, findMarkdownUrls} from '../utils/strings'
import {roundCoord} from '../utils/math'
import {addUserDataInGroup, setGroupColor} from '../utils/svg'
import {createComment, getIssueComments, getIssues} from '../utils/GitHub'
import {arrayDiff} from '../utils/arrays'
import {assertDefined} from '../utils/assert'
import {isDevMode} from '../utils/common'


const placeMarkGroupMap = new Map()
let renderCount = 0
let prevSynchSidebar


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
  const accessToken = useStore((state) => state.accessToken)
  const synchSidebar = useStore((state) => state.synchSidebar)
  const toggleSynchSidebar = useStore((state) => state.toggleSynchSidebar)
  const location = useLocation()


  useEffect(() => {
    (async () => {
      if (!Array.isArray(notes) || !notes.length || !repository || !placeMark || prevSynchSidebar === synchSidebar) {
        return
      }
      prevSynchSidebar = synchSidebar
      debug().log('usePlaceMark#useEffect: renderCount: ', ++renderCount)
      const issueArr = await getIssues(repository, accessToken)

      const promises1 = issueArr.map(async (issue) => {
        const issueComments = await getIssueComments(repository, issue.number, accessToken)
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
          addUserDataInGroup(activeGroup, {isActive: true})
        } else {
          // Drop active place mark mesh if it's not existed in scene
          const markArr = getObjectParams(activePlaceMarkHash)
          debug().log('usePlaceMark#useEffect: active markArr: ', markArr)
          const svgGroup = await placeMark.putDown({
            point: tempVec3.clone().set(floatStrTrim(markArr[0]), floatStrTrim(markArr[1]), floatStrTrim(markArr[2])),
          })
          addUserDataInGroup(svgGroup, {url: window.location.href, isActive: true})
          debug().log('usePlaceMark#useEffect: active svgGroup: ', svgGroup)
          placeMarkGroupMap.set(activePlaceMarkHash, svgGroup)
        }
      }

      const promises2 = inactivePlaceMarkHashes.map(async (hash) => {
        const svgGroup = placeMarkGroupMap.get(hash)
        if (svgGroup) {
          addUserDataInGroup(svgGroup, {isActive: false})
        } else {
          // Drop inactive place mark mesh if it's not existed in scene
          const markArr = getObjectParams(hash)
          debug().log('usePlaceMark#useEffect: inactive markArr: ', markArr)
          const newSvgGroup = await placeMark.putDown({
            point: tempVec3.clone().set(floatStrTrim(markArr[0]), floatStrTrim(markArr[1]), floatStrTrim(markArr[2])),
          })
          addUserDataInGroup(newSvgGroup, {url: totalPlaceMarkHashUrlMap.get(hash)})
          debug().log('usePlaceMark#useEffect: inactive newSvgGroup: ', newSvgGroup)
          placeMarkGroupMap.set(hash, newSvgGroup)
        }
      })

      await Promise.all(promises2)

      if (!isDevMode()) {
      // Remove unnecessary place mark meshes
        const curPlaceMarkHashes = Array.from(placeMarkGroupMap.keys())
        const deletedPlaceMarkHashes = arrayDiff(curPlaceMarkHashes, totalPlaceMarkHashes)
        debug().log('usePlaceMark#useEffect: deletedPlaceMarkHashes: ', deletedPlaceMarkHashes)
        deletedPlaceMarkHashes.forEach((hash) => {
          placeMark.disposePlaceMark(placeMarkGroupMap.get(hash))
        })
      }

      resetPlaceMarkColors()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synchSidebar])


  const createPlaceMark = ({context, oppositeObjects}) => {
    const newPlaceMark = new PlaceMark({context})
    newPlaceMark.setObjects(oppositeObjects)
    setPlaceMark(newPlaceMark)
  }


  const onSceneDoubleTap = useDoubleTap(async (event) => {
    if (!placeMark) {
      return
    }
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
  })


  const onSceneSingleTap = async (event, callback) => {
    if (!placeMark) {
      return
    }
    const res = placeMark.onSceneClick(event)

    switch (event.button) {
      case 0: // Main button (left button)
        if (event.shiftKey) {
          await dropPlaceMark(res)
        } else if (res.url) {
          selectPlaceMark(res.url)
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


  const dropPlaceMark = async ({point, promiseGroup}) => {
    if (point && promiseGroup) {
      const svgGroup = await promiseGroup
      debug().log('usePlaceMark#dropPlaceMark: svgGroup: ', svgGroup)
      const markArr = roundCoord(...point)
      addHashParams(window.location, PLACE_MARK_PREFIX, markArr)
      removeHashParams(window.location, CAMERA_PREFIX)
      debug().log('usePlaceMark#dropPlaceMark: window.location.href: ', window.location.href)
      addUserDataInGroup(svgGroup, {
        url: window.location.href,
      })
      const hash = getHashParamsFromUrl(window.location.href, PLACE_MARK_PREFIX)
      placeMarkGroupMap.set(hash, svgGroup)
      setPlaceMarkStatus(svgGroup, true)
    }

    deactivatePlaceMark()
    if (!repository || !Array.isArray(notes)) {
      return
    }
    debug().log('usePlaceMark#dropPlaceMark: `repository` `placeMarkId` condition is passed')
    const newNotes = [...notes]
    const placeMarkNote = newNotes.find((note) => note.id === placeMarkId)
    if (!placeMarkNote) {
      return
    }
    debug().log('usePlaceMark#dropPlaceMark: `placeMarkNote` condition is passed')
    const issueNumber = placeMarkNote.number
    const newComment = {
      body: `[placemark](${window.location.href})`,
    }
    const saveRes = await createComment(repository, issueNumber, newComment, accessToken)
    debug().log('usePlaceMark#dropPlaceMark: saveRes: ', saveRes)
    toggleSynchSidebar()
  }


  const selectPlaceMark = (url) => {
    assertDefined(url)
    debug().log('usePlaceMark#selectPlaceMark: url: ', url)
    const hash = getHashParamsFromUrl(url, PLACE_MARK_PREFIX)
    debug().log('usePlaceMark#selectPlaceMark: hash: ', hash)
    const svgGroup = placeMarkGroupMap.get(hash)
    debug().log('usePlaceMark#selectPlaceMark: svgGroup: ', svgGroup)

    if (svgGroup) {
      setPlaceMarkStatus(svgGroup, true)
      console.log('prom: ', process.env.NODE_ENV)
      if (!isDevMode()) {
        window.location.href = url // Change location hash
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


  const deactivatePlaceMark = () => {
    placeMark.deactivate()
    setPlaceMarkActivated(false)
  }


  const activatePlaceMark = () => {
    placeMark.activate()
    setPlaceMarkActivated(true)
  }


  return {createPlaceMark, onSceneDoubleTap, onSceneSingleTap, togglePlaceMarkActive}
}

const setPlaceMarkStatus = (svgGroup, isActive) => {
  assertDefined(svgGroup, isActive)
  debug().log('usePlaceMark#setPlaceMarkStatus: svgGroup: ', svgGroup)
  debug().log('usePlaceMark#setPlaceMarkStatus: isActive: ', isActive)
  svgGroup.userData.isActive = isActive
  resetPlaceMarkColors()
}

const resetPlaceMarkColors = () => {
  debug().log('usePlaceMark#resetPlaceMarkColors: placeMarkGroupMap: ', placeMarkGroupMap)
  placeMarkGroupMap.forEach((svgGroup) => {
    debug().log('usePlaceMark#resetPlaceMarkColors: svgGroup: ', svgGroup)
    let color = 'grey'
    const scale = tempVec3.clone().set(1, 1, 1)
    if (svgGroup.userData.isActive) {
      color = 'red'
      // eslint-disable-next-line no-magic-numbers
      scale.multiplyScalar(1.6)
    }
    debug().log('usePlaceMark#resetPlaceMarkColors: color: ', color)
    setGroupColor(svgGroup, color)
    svgGroup.scale.copy(scale.clone())
    svgGroup.userData.isActive = false
  })
}

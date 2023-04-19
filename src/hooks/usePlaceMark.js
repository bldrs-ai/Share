import {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {Vector3} from 'three'
import {useDoubleTap} from 'use-double-tap'
import useStore from '../store/useStore'
import PlaceMark from '../Infrastructure/PlaceMark'
import {addHashParams, getAllHashParams, getHashParams, getHashParamsFromUrl, getObjectParams, removeHashParams} from '../utils/location'
import {CAMERA_PREFIX} from '../Components/CameraControl'
import {floatStrTrim, findMarkdownUrls} from '../utils/strings'
import {roundCoord} from '../utils/math'
import {addUserDataInGroup, setGroupColor} from '../utils/svg'
import {createComment, getIssueComments, getIssues} from '../utils/GitHub'
import {arrayDiff} from '../utils/arrays'
import {assertDefined} from '../utils/assert'
import {existInFeature, isDevMode} from '../utils/common'


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
  const existPlaceMarkInFeature = existInFeature('placemark')


  useEffect(() => {
    (async () => {
      if (!repository || !placeMark || prevSynchSidebar === synchSidebar || !existPlaceMarkInFeature) {
        return
      }
      prevSynchSidebar = synchSidebar
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
      const totalPlaceMarkHashUrlMap = new Map()

      totalPlaceMarkUrls.forEach((url) => {
        const hash = getHashParamsFromUrl(url, PLACE_MARK_PREFIX)
        totalPlaceMarkHashUrlMap.set(hash, url)
      })

      const totalPlaceMarkHashes = Array.from(totalPlaceMarkHashUrlMap.keys())
      const activePlaceMarkHash = getHashParams(location, PLACE_MARK_PREFIX)
      const inactivePlaceMarkHashes = totalPlaceMarkHashes.filter((hash) => hash !== activePlaceMarkHash)

      if (activePlaceMarkHash) {
        const activeGroup = placeMarkGroupMap.get(activePlaceMarkHash)

        if (activeGroup) {
          addUserDataInGroup(activeGroup, {isActive: true})
        } else {
          // Drop active place mark mesh if it's not existed in scene
          const markArr = getObjectParams(activePlaceMarkHash)
          const svgGroup = await placeMark.putDown({
            point: new Vector3(floatStrTrim(markArr[0]), floatStrTrim(markArr[1]), floatStrTrim(markArr[2])),
          })
          addUserDataInGroup(svgGroup, {url: window.location.href, isActive: true})
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
          const newSvgGroup = await placeMark.putDown({
            point: new Vector3(floatStrTrim(markArr[0]), floatStrTrim(markArr[1]), floatStrTrim(markArr[2])),
          })
          addUserDataInGroup(newSvgGroup, {url: totalPlaceMarkHashUrlMap.get(hash)})
          placeMarkGroupMap.set(hash, newSvgGroup)
        }
      })

      await Promise.all(promises2)

      if (!isDevMode()) {
        // Remove unnecessary place mark meshes
        const curPlaceMarkHashes = Array.from(placeMarkGroupMap.keys())
        const deletedPlaceMarkHashes = arrayDiff(curPlaceMarkHashes, totalPlaceMarkHashes)
        deletedPlaceMarkHashes.forEach((hash) => {
          placeMark.disposePlaceMark(placeMarkGroupMap.get(hash))
        })
      }

      resetPlaceMarkColors()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synchSidebar])


  const createPlaceMark = ({context, oppositeObjects, postProcessor}) => {
    const newPlaceMark = new PlaceMark({context, postProcessor})
    newPlaceMark.setObjects(oppositeObjects)
    setPlaceMark(newPlaceMark)
  }


  const onSceneDoubleTap = useDoubleTap(async (event) => {
    if (!placeMark || !existPlaceMarkInFeature) {
      return
    }
    const res = placeMark.onSceneDoubleClick(event)

    switch (event.button) {
      case 0: // Main button (left button)
        await savePlaceMark(res)
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
    if (!placeMark || !existPlaceMarkInFeature) {
      return
    }
    const res = placeMark.onSceneClick(event)

    switch (event.button) {
      case 0: // Main button (left button)
        if (event.shiftKey) {
          await savePlaceMark(res)
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


  const savePlaceMark = async ({point, promiseGroup}) => {
    if (!existPlaceMarkInFeature) {
      return
    }

    if (point && promiseGroup) {
      const svgGroup = await promiseGroup
      const markArr = roundCoord(...point)
      addHashParams(window.location, PLACE_MARK_PREFIX, markArr)
      removeHashParams(window.location, CAMERA_PREFIX)
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
    const newNotes = [...notes]
    const placeMarkNote = newNotes.find((note) => note.id === placeMarkId)
    if (!placeMarkNote) {
      return
    }
    const issueNumber = placeMarkNote.number
    const newComment = {
      body: `[placemark](${window.location.href})`,
    }
    await createComment(repository, issueNumber, newComment, accessToken)
    toggleSynchSidebar()
  }


  const selectPlaceMark = (url) => {
    if (!existPlaceMarkInFeature) {
      return
    }
    assertDefined(url)
    const hash = getHashParamsFromUrl(url, PLACE_MARK_PREFIX)
    const svgGroup = placeMarkGroupMap.get(hash)

    if (svgGroup) {
      setPlaceMarkStatus(svgGroup, true)
      if (!isDevMode()) {
        window.location.hash = `#${getAllHashParams(url)}` // Change location hash
      }
    }
  }


  const togglePlaceMarkActive = (id) => {
    if (!existPlaceMarkInFeature) {
      return
    }

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
    if (!existPlaceMarkInFeature) {
      return
    }
    placeMark.deactivate()
    setPlaceMarkActivated(false)
  }


  const activatePlaceMark = () => {
    if (!existPlaceMarkInFeature) {
      return
    }
    placeMark.activate()
    setPlaceMarkActivated(true)
  }


  return {createPlaceMark, onSceneDoubleTap, onSceneSingleTap, togglePlaceMarkActive}
}


const setPlaceMarkStatus = (svgGroup, isActive) => {
  assertDefined(svgGroup, isActive)
  resetPlaceMarksActive(false)
  svgGroup.userData.isActive = isActive
  resetPlaceMarkColors()
}


const resetPlaceMarksActive = (isActive) => {
  placeMarkGroupMap.forEach((svgGroup) => {
    svgGroup.userData.isActive = isActive
  })
}


const resetPlaceMarkColors = () => {
  placeMarkGroupMap.forEach((svgGroup) => {
    let color = 'grey'
    if (svgGroup.userData.isActive) {
      color = 'red'
    }
    setGroupColor(svgGroup, color)
  })
}


const PLACE_MARK_PREFIX = 'm'
const placeMarkGroupMap = new Map()
let prevSynchSidebar

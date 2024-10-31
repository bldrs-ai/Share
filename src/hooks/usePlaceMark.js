import {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {Vector3} from 'three'
import {useDoubleTap} from 'use-double-tap'
import useStore from '../store/useStore'
import PlaceMark from '../Infrastructure/PlaceMark'
import {
  addHashParams,
  // eslint-disable-next-line no-unused-vars
  getAllHashParams,
  getHashParams,
  getHashParamsFromUrl,
  getObjectParams,
  removeHashParams,
} from '../utils/location'
import {HASH_PREFIX_CAMERA} from '../Components/Camera/hashState'
import {floatStrTrim, findMarkdownUrls} from '../utils/strings'
import {roundCoord} from '../utils/math'
import {addUserDataInGroup, setGroupColor} from '../utils/svg'
import {getIssueComments, getIssues} from '../net/github/Issues'
// eslint-disable-next-line no-unused-vars
import {createComment} from '../net/github/Comments'
// eslint-disable-next-line no-unused-vars
import {arrayDiff} from '../utils/arrays'
import {assertDefined} from '../utils/assert'
// eslint-disable-next-line no-unused-vars
import {isDevMode} from '../utils/common'
import {useExistInFeature} from './useExistInFeature'
import debug from '../utils/debug'


/**
 * Place Mark Hook
 *
 * @return {Function}
 */
export default function usePlaceMark() {
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
  const existPlaceMarkInFeature = useExistInFeature('placemark')
  const placeMarkMode = useStore((state) => state.placeMarkMode)
  const setPlaceMarkMode = useStore((state) => state.setPlaceMarkMode)


  useEffect(() => {
    (async () => {
      debug().log('usePlaceMark#useEffect[synchSidebar]: repository: ', repository)
      debug().log('usePlaceMark#useEffect[synchSidebar]: placeMark: ', placeMark)
      debug().log('usePlaceMark#useEffect[synchSidebar]: prevSynchSidebar: ', prevSynchSidebar)
      debug().log('usePlaceMark#useEffect[synchSidebar]: synchSidebar: ', synchSidebar)
      debug().log('usePlaceMark#useEffect[synchSidebar]: existPlaceMarkInFeature: ', existPlaceMarkInFeature)
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
            const newPlaceMarkUrls = findMarkdownUrls(comment.body, HASH_PREFIX_PLACE_MARK)
            placeMarkUrls = placeMarkUrls.concat(newPlaceMarkUrls)
          }
        })

        return placeMarkUrls
      })

      const totalPlaceMarkUrls = (await Promise.all(promises1)).flat()
      const totalPlaceMarkHashUrlMap = new Map()

      totalPlaceMarkUrls.forEach((url) => {
        const hash = getHashParamsFromUrl(url, HASH_PREFIX_PLACE_MARK)
        totalPlaceMarkHashUrlMap.set(hash, url)
      })

      const totalPlaceMarkHashes = Array.from(totalPlaceMarkHashUrlMap.keys())
      const activePlaceMarkHash = getHashParams(location, HASH_PREFIX_PLACE_MARK)
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
            normal: new Vector3(floatStrTrim(markArr[3]), floatStrTrim(markArr[4]), floatStrTrim(markArr[5])),
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
            normal: new Vector3(floatStrTrim(markArr[3]), floatStrTrim(markArr[4]), floatStrTrim(markArr[5])),
          })
          addUserDataInGroup(newSvgGroup, {url: totalPlaceMarkHashUrlMap.get(hash)})
          placeMarkGroupMap.set(hash, newSvgGroup)
        }
      })

      await Promise.all(promises2)

      /* if (!isDevMode()) {
        // Remove unnecessary place mark meshes
        const curPlaceMarkHashes = Array.from(placeMarkGroupMap.keys())
        const deletedPlaceMarkHashes = arrayDiff(curPlaceMarkHashes, totalPlaceMarkHashes)
        deletedPlaceMarkHashes.forEach((hash) => {
          placeMark.disposePlaceMark(placeMarkGroupMap.get(hash))
        })
      }*/

      resetPlaceMarkColors()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synchSidebar, placeMark])


  const createPlaceMark = ({context, oppositeObjects, postProcessor}) => {
    debug().log('usePlaceMark#createPlaceMark')
    const newPlaceMark = new PlaceMark({context, postProcessor})
    newPlaceMark.setObjects(oppositeObjects)
    setPlaceMark(newPlaceMark)
  }


  const onSceneDoubleTap = useDoubleTap(async (event) => {
    debug().log('usePlaceMark#onSceneDoubleTap')
    if (!placeMark || !existPlaceMarkInFeature || !placeMarkMode) {
      return
    }
    const res = placeMark.onSceneDoubleClick(event)

    switch (event.button) {
      case 0: // Main button (left button)
        await savePlaceMark(res)
        break
      case 1: // Wheel button (middle button if present)
        break
      case 2: // Secondary button (right button)
        break
      case 3: // Fourth button (back button)
        break
      case 4: // Fifth button (forward button)
        break
      default:
        break
    }
  })


  const onSceneSingleTap = async (event, callback) => {
    debug().log('usePlaceMark#onSceneSingleTap')
    if (!placeMark || !existPlaceMarkInFeature) {
      return
    }
    const res = placeMark.onSceneClick(event)

    switch (event.button) {
      case 0: // Main button (left button)
        if (event.shiftKey) {
          await savePlaceMark(res)
        } else if (res.marker) {
          selectPlaceMark(res)
        }
        break
      case 1: // Wheel button (middle button if present)
        break
      case 2: // Secondary button (right button)
        break
      case 3: // Fourth button (back button)
        break
      case 4: // Fifth button (forward button)
        break
      default:
        break
    }

    if (callback) {
      callback(res)
    }
  }


  const savePlaceMark = async ({point, normal, promiseGroup}) => {
    if (!existPlaceMarkInFeature) {
      return
    }

    if (point && normal && promiseGroup) {
      const svgGroup = await promiseGroup
      const positionData = roundCoord(...point)
      const normalData = roundCoord(...normal)
      const markArr = positionData.concat(normalData)
      addHashParams(window.location, HASH_PREFIX_PLACE_MARK, markArr)
      removeHashParams(window.location, HASH_PREFIX_CAMERA)
      addUserDataInGroup(svgGroup, {
        url: window.location.href,
      })
      const hash = getHashParamsFromUrl(window.location.href, HASH_PREFIX_PLACE_MARK)
      placeMarkGroupMap.set(hash, svgGroup)
      setPlaceMarkStatus(svgGroup, true)
    }

    setPlaceMarkMode(false)
    deactivatePlaceMark()
    if (!repository || !Array.isArray(notes)) {
      return
    }
    const newNotes = [...notes]
    const placeMarkNote = newNotes.find((note) => note.id === placeMarkId)
    if (!placeMarkNote) {
      return
    }
    // eslint-disable-next-line no-unused-vars
    const issueNumber = placeMarkNote.number
    // eslint-disable-next-line no-unused-vars
    const newComment = {
      body: `[placemark](${window.location.href})`,
    }
    // TODO: ennable createComment
    // await createComment(repository, issueNumber, newComment, accessToken)
    toggleSynchSidebar()
  }


  const selectPlaceMark = (res) => {
    if (!existPlaceMarkInFeature) {
      return
    }
    assertDefined(res.marker)
    let foundKey = null

    for (const [key, value] of placeMarkGroupMap.entries()) {
      if (value.uuid === res.marker.uuid) {
        foundKey = key
        break
      }
    }

    if (foundKey !== null) {
      window.location.hash = `#${foundKey}` // Change location hash
    }

    /* const hash = getHashParamsFromUrl(url, HASH_PREFIX_PLACE_MARK)
    const svgGroup = placeMarkGroupMap.get(hash)

    if (svgGroup) {
      setPlaceMarkStatus(svgGroup, true)
      if (!isDevMode()) {
        window.location.hash = `#${getAllHashParams(url)}` // Change location hash
      }
    }*/
  }


  const togglePlaceMarkActive = (id) => {
    debug().log('usePlaceMark#togglePlaceMarkActive: id: ', id)
    if (!existPlaceMarkInFeature) {
      return
    }

    setPlaceMarkMode(true)

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


const HASH_PREFIX_PLACE_MARK = 'm'
const placeMarkGroupMap = new Map()
let prevSynchSidebar

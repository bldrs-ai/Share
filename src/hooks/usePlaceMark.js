/* eslint-disable no-console */
/* eslint-disable react-hooks/exhaustive-deps */
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
import {getIssues} from '../utils/GitHub'
import {arrayDiff} from '../utils/arrays'
import {assertDefined} from '../utils/assert'
import {isDevMode} from '../utils/common'
import {useExistInFeature} from './useExistInFeature'
import debug from '../utils/debug'
import {updateIssue} from '../utils/GitHub'


const PLACE_MARK_PREFIX = 'm'
const placeMarkGroupMap = new Map()

// console.log('placeMarkGroupMap', placeMarkGroupMap)

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
  const location = useLocation()
  const existPlaceMarkInFeature = useExistInFeature('placemark')
  const setNotes = useStore((state) => state.setNotes)
  // console.log('placeMark', placeMark)

  useEffect(() => {
    let totalPlaceMarkHashUrlMap = new Map()

    const processPlaceMarks = async () => {
      if (!repository || !placeMark || !existPlaceMarkInFeature) {
        return
      }

      const issueArr = await getIssues(repository, accessToken)
      const placeMarkUrls = await extractPlaceMarkUrls(issueArr)
      const processedData = processPlaceMarkUrls(placeMarkUrls)

      // Update totalPlaceMarkHashUrlMap here
      totalPlaceMarkHashUrlMap = processedData.totalPlaceMarkHashUrlMap

      await handleActivePlaceMark(processedData.activePlaceMarkHash, totalPlaceMarkHashUrlMap)
      await handleInactivePlaceMarks(processedData.inactivePlaceMarkHashes, totalPlaceMarkHashUrlMap)
      removeDeletedPlaceMarksIfNeeded()
      resetPlaceMarkColors()
    }
    const extractPlaceMarkUrls = async (issues) => {
      return (await Promise.all(issues.map(async (issue) => {
        return issue.body ? await findMarkdownUrls(issue.body, PLACE_MARK_PREFIX) : []
      }))).flat()
    }
    const processPlaceMarkUrls = (urls) => {
      const hashUrlMap = new Map(urls.map((url) => [getHashParamsFromUrl(url, PLACE_MARK_PREFIX), url]))
      const hashes = Array.from(hashUrlMap.keys())
      const activeHash = getHashParams(location, PLACE_MARK_PREFIX)
      const inactiveHashes = hashes.filter((hash) => hash !== activeHash)
      return {totalPlaceMarkHashUrlMap: hashUrlMap, inactivePlaceMarkHashes: inactiveHashes, activePlaceMarkHash: activeHash}
    }
    const handleActivePlaceMark = async (activeHash, hashUrlMap) => {
      if (activeHash) {
        let svgGroup = placeMarkGroupMap.get(activeHash)
        if (!svgGroup) {
          svgGroup = await createAndAddSvgGroup(activeHash)
        }
        addUserDataInGroup(svgGroup, {url: window.location.href, isActive: true})
      }
    }
    const handleInactivePlaceMarks = async (hashes, hashUrlMap) => {
      await Promise.all(hashes.map(async (hash) => {
        const svgGroup = placeMarkGroupMap.get(hash) || await createAndAddSvgGroup(hash)
        addUserDataInGroup(svgGroup, {url: hashUrlMap.get(hash), isActive: false})
      }))
    }
    const createAndAddSvgGroup = async (hash) => {
      const markArr = getObjectParams(hash)
      const svgGroup = await placeMark.putDown({
        point: new Vector3(floatStrTrim(markArr[0]), floatStrTrim(markArr[1]), floatStrTrim(markArr[2])),
      })
      placeMarkGroupMap.set(hash, svgGroup)
      return svgGroup
    }

    const removeDeletedPlaceMarksIfNeeded = () => {
      // console.log('in the remove placemark')
      if (!isDevMode()) {
        const currentHashes = Array.from(placeMarkGroupMap.keys())
        // Use totalPlaceMarkHashUrlMap here directly
        const deletedHashes = arrayDiff(currentHashes, Array.from(totalPlaceMarkHashUrlMap.keys()))
        deletedHashes.forEach((hash) => placeMark.disposePlaceMark(placeMarkGroupMap.get(hash)))
      }
    }
    processPlaceMarks()
    // console.log('in the placemark use effect')
  }, [placeMark])

  // ------------------------------------------------------------------------------------
  const onSceneDoubleTap = useDoubleTap(async (event) => {
    if (!placeMark || !existPlaceMarkInFeature) {
      return
    }
    const placeMarkObj = placeMark.onSceneDoubleClick(event)
    // console.log('placemark object', placeMarkObj )
    await savePlaceMark(placeMarkObj.point, placeMarkObj.promiseGroup )
  })

  const onSceneSingleTap = (event, callback) => {
    debug().log('usePlaceMark#onSceneSingleTap')
    if (!placeMark || !existPlaceMarkInFeature) {
      return
    }
    const res = placeMark.onSceneClick(event)
    if (res.url) {
      selectPlaceMark(res.url)
    }
    if (callback) {
      callback(res)
    }
  }
  // ------------------------------------------------------------------------------------


  // ------------------------------------------------------------------------------------
  const createPlaceMark = ({context, oppositeObjects, postProcessor}) => {
    const newPlaceMark = new PlaceMark({context, postProcessor})
    newPlaceMark.setObjects(oppositeObjects)
    setPlaceMark(newPlaceMark)
  }

  const savePlaceMark = async (placemarkCoordinate, placeMarkObjGroup) => {
    if (!existPlaceMarkInFeature || !repository || !Array.isArray(notes)) {
      return
    }
    const placeMarkInfoGroup = placemarkCoordinate && placeMarkObjGroup ? await placeMarkObjGroup : null

    // what does this method do?
    if (placeMarkInfoGroup) {
      updateLocationAndGroup(placemarkCoordinate, placeMarkInfoGroup)
    }
    // console.log('placeMarkObjGroup', placeMarkObjGroup)
    deactivatePlaceMark()
    updatePlaceMarkNote()
  }

  const updatePlaceMarkNote = () => {
    const placeMarkNote = notes.find((note) => note.id === placeMarkId)
    if (!placeMarkNote) {
      return
    }
    // deletedHashes.forEach((hash) => placeMark.disposePlaceMark(placeMarkGroupMap.get(hash)))
    // console.log('placeMarkGroupMap', placeMarkGroupMap)
    const newPlaceMarkUrls = findMarkdownUrls(placeMarkNote.body, PLACE_MARK_PREFIX)
    const editedBody = createEditedNoteBody(placeMarkNote.body, newPlaceMarkUrls)
    submitUpdate(placeMarkNote.number, placeMarkNote.title, editedBody, placeMarkNote.id)
  }

  const createEditedNoteBody = (body, newPlaceMarkUrls) => {
    const placemarkPattern = /\n\[placemark\]\(.*?\)/
    if (newPlaceMarkUrls.length === 0 || !placemarkPattern.test(body)) {
      return `${body}\n\n---\n[placemark](${window.location.href})`
    }
    const urlBetweenPrent = /\((.*?)\)/
    const extractedPlacemark = body.match(placemarkPattern)[0]
    const placemarkUrl = extractedPlacemark.match(urlBetweenPrent)[1]
    const placemarkHash = getHashParamsFromUrl(placemarkUrl, PLACE_MARK_PREFIX)
    // console.log('placeMark --- ', placeMark)
    console.log('placemarkHash', placemarkHash)
    placeMark.disposePlaceMark(placeMarkGroupMap.get(placemarkHash))

    return body.replace(placemarkPattern, `\n[placemark](${window.location.href})`)
  }
  /** Submit update*/
  async function submitUpdate(noteNumber, title, editBody, id) {
    const res = await updateIssue(repository, noteNumber, title, editBody, accessToken)
    const editedNote = notes.find((note) => note.id === id)
    editedNote.body = res.data.body
    setNotes(notes)
  }
  // ------------------------------------------------------------------------------------


  // ------------------------------------------------------------------------------------
  const updateLocationAndGroup = (point, placeMarkInfoGroup) => {
    const placeMarkCoordinates = roundCoord(...point)
    updateUrlWithPlaceMark(placeMarkCoordinates, placeMarkInfoGroup)

    const hash = getHashParamsFromUrl(window.location.href, PLACE_MARK_PREFIX)
    placeMarkGroupMap.set(hash, placeMarkInfoGroup)
    setPlaceMarkStatus(placeMarkInfoGroup, true)
  }

  const updateUrlWithPlaceMark = (placeMarkCoordinates, placeMarkInfoGroup) => {
    addHashParams(window.location, PLACE_MARK_PREFIX, placeMarkCoordinates)
    removeHashParams(window.location, CAMERA_PREFIX)
    addUserDataInGroup(placeMarkInfoGroup, {url: window.location.href}) // Now svgGroup is defined in this scope
  }
  // ------------------------------------------------------------------------------------


  // ------------------------------------------------------------------------------------
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
    debug().log('usePlaceMark#togglePlaceMarkActive: id: ', id)
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
    // if (!existPlaceMarkInFeature) {
    //   return
    // }
    placeMark.activate()
    setPlaceMarkActivated(true)
  }
  // ------------------------------------------------------------------------------------

  return {createPlaceMark, onSceneDoubleTap, onSceneSingleTap, togglePlaceMarkActive}
}


// --------------------------------------------------------------------------------------
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
    let color = '#00F0FF'
    if (svgGroup.userData.isActive) {
      color = '#69F566'
    }
    setGroupColor(svgGroup, color)
  })
}


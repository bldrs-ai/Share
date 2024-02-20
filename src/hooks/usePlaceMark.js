/* eslint-disable react-hooks/exhaustive-deps */
import {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {useDoubleTap} from 'use-double-tap'
import {extractPlaceMarkUrls,
  processPlaceMarkUrls,
  createAndAddSvgGroup,
  removeDeletedPlaceMarksIfNeeded} from './placeMarkUtils'
import useStore from '../store/useStore'
import PlaceMark from '../Infrastructure/PlaceMark'
import {addHashParams, getAllHashParams, getHashParamsFromUrl, removeHashParams} from '../utils/location'
import {CAMERA_PREFIX} from '../Components/CameraControl'
import {findMarkdownUrls} from '../utils/strings'
import {roundCoord} from '../utils/math'
import {addUserDataInGroup, setGroupColor} from '../utils/svg'
import {getIssues} from '../utils/GitHub'
import {assertDefined} from '../utils/assert'
import {isDevMode} from '../utils/common'
import {useExistInFeature} from './useExistInFeature'
import debug from '../utils/debug'
import {updateIssue} from '../utils/GitHub'


const PLACE_MARK_PREFIX = 'm'
const placeMarkGroupMap = new Map()
const setPlaceMarkStatus = (svgGroup, isActive ) => {
  assertDefined(svgGroup, isActive)
  resetPlaceMarksActive(false)
  svgGroup.userData.isActive = isActive
  resetPlaceMarkColors(placeMarkGroupMap)
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


/**
 * Place Mark Hook
 *
 * @return {Function}
 */
export function usePlaceMark() {
  const existPlaceMarkInFeature = useExistInFeature('placemark')
  const location = useLocation()
  const accessToken = useStore((state) => state.accessToken)
  const notes = useStore((state) => state.notes)
  const placeMark = useStore((state) => state.placeMark)
  const placeMarkId = useStore((state) => state.placeMarkId)
  const repository = useStore((state) => state.repository)
  const setNotes = useStore((state) => state.setNotes)
  const setPlaceMark = useStore((state) => state.setPlaceMark)
  const setPlaceMarkActivated = useStore((state) => state.setPlaceMarkActivated)
  const setPlaceMarkId = useStore((state) => state.setPlaceMarkId)


  useEffect(() => {
    let placeMarksMap = new Map()
    const processPlaceMarks = async () => {
      if (!repository || !placeMark || !existPlaceMarkInFeature) {
        return
      }

      const issueArr = await getIssues(repository, accessToken)
      const placeMarkUrls = await extractPlaceMarkUrls(issueArr)
      const processedData = processPlaceMarkUrls(placeMarkUrls, location)

      placeMarksMap = processedData.placeMarksMap

      await handleActivePlaceMark(processedData.activePlaceMarkHash)
      await handleInactivePlaceMarks(processedData.inactivePlaceMarkHashes, placeMarksMap)
      removeDeletedPlaceMarksIfNeeded(placeMarkGroupMap, placeMarksMap, placeMark)
      resetPlaceMarkColors(placeMarkGroupMap)
    }

    const handleActivePlaceMark = async (activeHash) => {
      if (activeHash) {
        let svgGroup = placeMarkGroupMap.get(activeHash)
        if (!svgGroup) {
          svgGroup = await createAndAddSvgGroup(activeHash, placeMark, placeMarkGroupMap)
        }
        addUserDataInGroup(svgGroup, {url: window.location.href, isActive: true})
      }
    }

    const handleInactivePlaceMarks = async (hashes, hashUrlMap) => {
      await Promise.all(hashes.map(async (hash) => {
        const svgGroup = placeMarkGroupMap.get(hash) || await createAndAddSvgGroup(hash, placeMark, placeMarkGroupMap)
        addUserDataInGroup(svgGroup, {url: hashUrlMap.get(hash), isActive: false})
      }))
    }

    processPlaceMarks()
  }, [placeMark])


  const onSceneDoubleTap = useDoubleTap(async (event) => {
    if (!placeMark || !existPlaceMarkInFeature) {
      return
    }
    const placeMarkObj = placeMark.onSceneDoubleClick(event)
    await savePlaceMark(placeMarkObj.point, placeMarkObj.promiseGroup )
  })

  const onSceneSingleTap = (event) => {
    if (!placeMark || !existPlaceMarkInFeature) {
      return
    }
    const res = placeMark.onSceneClick(event)
    if (res.url) {
      selectPlaceMark(res.url)
    }
  }

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

    if (placeMarkInfoGroup) {
      updateLocationAndGroup(placemarkCoordinate, placeMarkInfoGroup)
    }
    deactivatePlaceMark()
    updatePlaceMarkNote()
  }

  const updatePlaceMarkNote = () => {
    const placeMarkNote = notes.find((note) => note.id === placeMarkId)
    if (!placeMarkNote) {
      return
    }
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


  const updateLocationAndGroup = (point, placeMarkInfoGroup) => {
    const placeMarkCoordinates = roundCoord(...point)
    updateUrlWithPlaceMark(placeMarkCoordinates, placeMarkInfoGroup)

    const hash = getHashParamsFromUrl(window.location.href, PLACE_MARK_PREFIX)
    placeMarkGroupMap.set(hash, placeMarkInfoGroup)
    setPlaceMarkStatus(placeMarkInfoGroup, true, placeMarkGroupMap)
  }

  const updateUrlWithPlaceMark = (placeMarkCoordinates, placeMarkInfoGroup) => {
    addHashParams(window.location, PLACE_MARK_PREFIX, placeMarkCoordinates)
    removeHashParams(window.location, CAMERA_PREFIX)
    addUserDataInGroup(placeMarkInfoGroup, {url: window.location.href})
  }

  const selectPlaceMark = (url) => {
    if (!existPlaceMarkInFeature) {
      return
    }
    assertDefined(url)
    const hash = getHashParamsFromUrl(url, PLACE_MARK_PREFIX)
    const svgGroup = placeMarkGroupMap.get(hash)

    if (svgGroup) {
      setPlaceMarkStatus(svgGroup, true, placeMarkGroupMap)
      if (!isDevMode()) {
        window.location.hash = `#${getAllHashParams(url)}`
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
    placeMark.activate()
    setPlaceMarkActivated(true)
  }
  return {createPlaceMark, onSceneDoubleTap, onSceneSingleTap, togglePlaceMarkActive}
}

// MarkerControl.jsx

import React, {useEffect} from 'react'
import PropTypes from 'prop-types'
import debug from '../../utils/debug'
import useStore from '../../store/useStore'
import {HASH_PREFIX_PLACE_MARK} from './hashState'
import {findMarkdownUrls} from '../../utils/strings'
import {getHashParams,
    getHashParamsFromUrl,
    setParamsToHash,
    removeParamsFromHash,
    stripHashParams,
    batchUpdateHash} from '../../utils/location'
import {Vector3} from 'three'
import PlaceMark from '../../Infrastructure/PlaceMark'
import {HASH_PREFIX_CAMERA} from '../../Components/Camera/hashState'
import {roundCoord} from '../../utils/math'
import {setGroupColor} from '../../utils/svg'
import {assertDefined} from '../../utils/assert'
import {HASH_PREFIX_COMMENT, HASH_PREFIX_NOTES} from '../Notes/hashState'


/**
 * Parses placemark URLs from an issue body.
 *
 * Extracts URLs that contain the specified placemark hash prefix from a given issue body.
 *
 * @param {string} issueBody The body of the issue to parse for placemark URLs.
 * @return {string[]} An array of extracted placemark URLs.
 */
export function parsePlacemarkFromIssue(issueBody) {
    return findMarkdownUrls(issueBody, HASH_PREFIX_PLACE_MARK)
}

/**
 * Retrieves the active placemark hash from the current location.
 *
 * Extracts the hash associated with a placemark (based on the defined hash prefix)
 * from the current window's location object.
 *
 * @return {string|null} The active placemark hash, or `null` if no hash is found.
 */
export function getActivePlaceMarkHash() {
    return getHashParams(location, HASH_PREFIX_PLACE_MARK)
}

/**
 * Extracts the placemark hash from a given URL.
 *
 * Parses a URL to extract the hash segment associated with a placemark,
 * based on the defined hash prefix.
 *
 * @param {string} url The URL to parse for a placemark hash.
 * @return {string|null} The extracted placemark hash, or `null` if no hash is found.
 */
export function parsePlacemarkFromURL(url) {
    return getHashParamsFromUrl(url, HASH_PREFIX_PLACE_MARK)
}

/**
 * Removes placemark parameters from the URL.
 *
 * This function removes any URL hash parameters associated with placemarks
 * (identified by the placemark hash prefix) from the current browser window's location
 * or a specified location object.
 *
 * @param {Location|null} location The location object to modify. If null, uses `window.location`.
 * @return {string} The updated hash string with placemark parameters removed.
 */
export function removeMarkerUrlParams(location = null) {
    return stripHashParams(location ? location : window.location, HASH_PREFIX_PLACE_MARK)
}


/**
 * Place Mark Hook
 *
 * @return {Function}
 */
function PlacemarkHandlers() {
    const placeMark = useStore((state) => state.placeMark)
    const setPlaceMark = useStore((state) => state.setPlaceMark)
    const placeMarkId = useStore((state) => state.placeMarkId)
    const setPlaceMarkId = useStore((state) => state.setPlaceMarkId)
    const setPlaceMarkActivated = useStore((state) => state.setPlaceMarkActivated)
    const repository = useStore((state) => state.repository)
    const notes = useStore((state) => state.notes)
    const synchSidebar = useStore((state) => state.synchSidebar)
    const toggleSynchSidebar = useStore((state) => state.toggleSynchSidebar)
    const setPlaceMarkMode = useStore((state) => state.setPlaceMarkMode)
    const isNotesVisible = useStore((state) => state.isNotesVisible)
    const body = useStore((state) => state.body)
    const setBody = useStore((state) => state.setBody)
    const setEditBodyGlobal = useStore((state) => state.setEditBody)
    const editBodies = useStore((state) => state.editBodies)
    const editModes = useStore((state) => state.editModes)
    // Access markers and the necessary store functions
    const markers = useStore((state) => state.markers)
    const setSelectedPlaceMarkId = useStore((state) => state.setSelectedPlaceMarkId)

    // Update the useEffect
    useEffect(() => {
      (async () => {
        if (!placeMark || prevSynchSidebar === synchSidebar) {
          return
        }
        prevSynchSidebar = synchSidebar

        // dispose existing placemarks if they exist
        placeMark.disposePlaceMarks()

        placeMarkGroupMap.clear()

        // Loop over markers to place each one in the scene
        for (const marker of markers) {
          if (!placeMarkGroupMap[marker.id]) {
            const svgGroup = await placeMark.putDown({
              point: new Vector3(marker.coordinates[0], marker.coordinates[1], marker.coordinates[2]),
              normal: new Vector3(marker.coordinates[3], marker.coordinates[4], marker.coordinates[5]),
              fillColor: marker.inactiveColor,
              active: marker.isActive,
            })

            svgGroup.visible = isNotesVisible
            svgGroup.userData.isActive = marker.isActive
            svgGroup.userData.activeColor = marker.activeColor
            svgGroup.userData.inactiveColor = marker.inactiveColor
            svgGroup.userData.color = marker.isActive ? marker.activeColor : marker.inactiveColor
            svgGroup.userData.id = marker.commentId ? marker.commentId : marker.id

            placeMarkGroupMap.set(svgGroup.userData.id, svgGroup)
          }
        }


      // eslint-disable-next-line no-unused-vars
      for (const [_, value] of placeMarkGroupMap.entries()) {
        if (value.userData.isActive) {
          // set color to active if active
          value.userData.color = value.userData.activeColor
          value.material.color.set(value.userData.activeColor)
        } else {
          // set color to inactive
          value.userData.isActive = false
          value.userData.color = value.userData.inactiveColor
          value.material.color.set(value.userData.inactiveColor)
        }
      }
    })()
      // Add markers to the dependency array so useEffect re-runs on markers change
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [markers])


    // Save a placemark
    const savePlaceMark = async ({point, normal, promiseGroup}) => {
    if (point && normal && promiseGroup) {
      const svgGroup = await promiseGroup
      const positionData = roundCoord(...point)
      const normalData = roundCoord(...normal)
      const markArr = positionData.concat(normalData)

      // Update location hash
      batchUpdateHash(window.location, [
        (hash) => setParamsToHash(hash, HASH_PREFIX_PLACE_MARK, markArr), // Add placemark
        (hash) => removeParamsFromHash(hash, HASH_PREFIX_CAMERA), // Remove camera
        (hash) => removeParamsFromHash(hash, HASH_PREFIX_NOTES), // Remove notes
        (hash) => removeParamsFromHash(hash, HASH_PREFIX_COMMENT), // Remove comment
      ])

      // Add metadata to the temporary marker
      const hash = getHashParamsFromUrl(window.location.href, HASH_PREFIX_PLACE_MARK)
      const inactiveColor = 0xA9A9A9
      const activeColor = 0xff0000
      svgGroup.userData.isActive = false
      svgGroup.userData.activeColor = activeColor
      svgGroup.userData.inactiveColor = inactiveColor
      svgGroup.userData.color = inactiveColor
      svgGroup.material.color.set(inactiveColor)
      svgGroup.userData.id = hash

      placeMarkGroupMap.set(hash, svgGroup)
      setPlaceMarkStatus(svgGroup, true)
    }

    setPlaceMarkMode(false)
    placeMark.deactivate()
    setPlaceMarkActivated(false)

    if (!repository || !Array.isArray(notes)) {
        return
      }

      const newNotes = [...notes]
      const placeMarkNote = newNotes.find((note) => note.id === placeMarkId)
      if (!placeMarkNote) {
        return
      }

      // Get the current note body and append the new placemark link
      const editMode = editModes?.[placeMarkNote.id]
      const newCommentBody = `[placemark](${window.location.href})`
      const currentBody = editMode ? (editBodies[placeMarkNote.id] || '') : (body || '') // Retrieve the existing body
      const updatedBody = `${currentBody}\n${newCommentBody}`

      // Set the updated body in the global store so NoteCard can use it
      if (editMode) {
        setEditBodyGlobal(placeMarkNote.id, updatedBody)
      } else {
        setBody(updatedBody) // Fallback to set the local body if not in edit mode
      }

      // Toggle the sidebar visibility after adding the placemark link
      toggleSynchSidebar()
  }

  // Select a placemark
  const selectPlaceMark = (res) => {
    assertDefined(res.marker)

    let foundKey = null

    for (const [key, value] of placeMarkGroupMap.entries()) {
      if (key === res.marker.userData.id) {
        res.marker.userData.isActive = true
        res.marker.userData.color = res.marker.userData.activeColor
        res.marker.material.color.set(res.marker.userData.activeColor)
        foundKey = key
      } else {
        value.userData.isActive = false
        value.userData.color = value.userData.inactiveColor
        value.material.color.set(value.userData.inactiveColor)
      }
    }

    if (foundKey !== null) {
      setSelectedPlaceMarkId(foundKey)
    }
  }

 const onSceneSingleTap = async (event, callback) => {
    debug().log('usePlaceMark#onSceneSingleTap')
    if (!placeMark) {
      return
    }
    const res = placeMark.onSceneClick(event)

    switch (event.button) {
      case 0:
        if (event.shiftKey) {
          await savePlaceMark(res)
        } else if (res.marker) {
          selectPlaceMark(res)
        }
        break
      // Add other cases as needed
      default:
        break
    }

    if (callback) {
      callback(res)
    }
  }

   const onSceneDoubleTap = async (event) => {
    debug().log('usePlaceMark#onSceneDoubleTap')
    if (!placeMark) {
      return
    }
    const res = placeMark.onSceneDoubleClick(event)

    switch (event.button) {
      case 0:
        await savePlaceMark(res)
        break
      // Add other cases as needed
      default:
        break
    }
  }
 /**
  *
  */
 function togglePlaceMarkActive(id) {
    const deactivatePlaceMark = () => {
      if (!placeMark) {
return
}
      placeMark.deactivate()
      setPlaceMarkActivated(false)
    }

    const activatePlaceMark = () => {
      if (!placeMark) {
return
}
      placeMark.activate()
      setPlaceMarkActivated(true)
    }

    if (!placeMark) {
return
}

    setPlaceMarkMode(true)

    if (placeMarkId === id && placeMark.activated) {
      deactivatePlaceMark()
    } else {
      activatePlaceMark()
    }

    setPlaceMarkId(id)
  }

    const createPlaceMark = ({context, oppositeObjects, postProcessor}) => {
      debug().log('usePlaceMark#createPlaceMark')
      const newPlaceMark = new PlaceMark({context, postProcessor})
      newPlaceMark.setObjects(oppositeObjects)
      setPlaceMark(newPlaceMark)
      return newPlaceMark
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


const placeMarkGroupMap = new Map()
let prevSynchSidebar

// eslint-disable-next-line react/display-name
const MarkerControl = React.memo(({context, oppositeObjects, postProcessor}) => {
  // eslint-disable-next-line new-cap
  const {createPlaceMark} = PlacemarkHandlers()
  const placeMark = useStore((state) => state.placeMark)
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const selectedPlaceMarkId = useStore((state) => state.selectedPlaceMarkId)
  const markers = useStore((state) => state.markers)

useEffect(() => {
  if (!selectedPlaceMarkId || !markers || markers.length === 0) {
    return
  }

  // Find the marker with the matching selectedPlaceMarkId
  const selectedMarker = markers.find((marker) =>
    marker.id === selectedPlaceMarkId || marker.commentId === selectedPlaceMarkId,
  )

  if (selectedMarker) {
    const {id, commentId, coordinates} = selectedMarker

    // Construct the coordinates hash segment
    const coordinatesHash = `#${HASH_PREFIX_PLACE_MARK}:${coordinates.join(',')}`

    // Construct the issue/comment hash segment
    const issueHash = `;i:${id}${commentId ? `;gc:${commentId}` : ''}`

    // Combine both segments
    const hash = `${coordinatesHash}${issueHash}`

    // Set the location hash
    window.location.hash = hash
  } else {
    // see if we have a temporary marker in the local group map
    const temporaryMarker = placeMarkGroupMap.get(selectedPlaceMarkId)

    if (temporaryMarker) {
        window.location.hash = `#${selectedPlaceMarkId}`
    }
  }
}, [selectedPlaceMarkId, markers]) // Add markers as a dependency if it can change


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

    // Only start render loop once
    _placeMark.onRender()

    return () => {
        // Cleanup logic will be added here in the future if needed
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
export {PlacemarkHandlers}

import PropTypes from 'prop-types'
import {memo, useEffect} from 'react'
import {Vector3} from 'three'
import {assertDefined} from '../../utils/assert'
import debug from '../../utils/debug'
import {roundCoord} from '../../utils/math'
import {setGroupColor} from '../../utils/svg'
import {
  getHashParamsFromUrl,
} from '../../utils/location'
import PlaceMark from '../../Infrastructure/PlaceMark'
import {
  HASH_PREFIX_COMMENT,
  HASH_PREFIX_NOTES,
} from '../Notes/hashState'
import useStore from '../../store/useStore'
import {MARKER_COLOR_ACTIVE, MARKER_COLOR_INACTIVE} from './component'
import {
  HASH_PREFIX_PLACE_MARK,
  saveMarkToHash,
} from './hashState'


/**
 * MarkerControl Component
 *
 * Manages the creation, visibility, and selection of markers within the application.
 * Handles setting the URL hash based on selected markers for navigation and linking.
 *
 * @param {object} props The properties passed to the component.
 * @param {object} props.context The application context, typically containing configuration or state.
 * @param {object} props.oppositeObjects An object containing references to objects opposite to the current focus.
 * @param {Function} props.postProcessor A callback function for post-processing marker-related actions.
 * @return {null}
 */
function MarkerControl({context, oppositeObjects, postProcessor}) {
  assertDefined(context, oppositeObjects, postProcessor)

  // eslint-disable-next-line new-cap
  const {createPlaceMark} = PlacemarkHandlers()
  const placeMark = useStore((state) => state.placeMark)
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const selectedPlaceMarkId = useStore((state) => state.selectedPlaceMarkId)
  const markers = useStore((state) => state.markers)
  // eslint-disable-next-line no-unused-vars
  const {selectedPlaceMarkInNoteId, cameraHash, forceMarkerNoteSync} = useStore((state) => ({
    selectedPlaceMarkInNoteId: state.selectedPlaceMarkInNoteId,
    cameraHash: state.cameraHash,
    forceMarkerNoteSync: state.forceMarkerNoteSync,
  }))

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
      const issueHash = `;${HASH_PREFIX_NOTES}:${id}${commentId ? `;${HASH_PREFIX_COMMENT}:${commentId}` : ''}`


      // Combine both segments
      const hash_ = `${coordinatesHash}${issueHash}${cameraHash ? `;${cameraHash}` : ''}`

      // Set the location hash
      window.location.hash = hash_
    } else {
      // see if we have a temporary marker in the local group map
      const temporaryMarker = placeMarkGroupMap.get(selectedPlaceMarkId)

      if (temporaryMarker) {
        window.location.hash = `#${selectedPlaceMarkId}`
      }
    }
  }, [cameraHash, selectedPlaceMarkId, markers, forceMarkerNoteSync]) // Add markers as a dependency if it can change


  // Toggle visibility of all placemarks based on isNotesVisible
  useEffect(() => {
    if (!placeMark) {
      return
    }

    placeMark.getPlacemarks().forEach((placemark_) => {
      placemark_.visible = isNotesVisible
    })
  }, [isNotesVisible, placeMark])


  // Initialize PlaceMark instance
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


  // End of MarkerControl - no component returned
  return null
}

export default memo(MarkerControl)


/**
 * Place Mark Hook
 *
 * @return {object}
 */
export function PlacemarkHandlers() {
  const placeMark = useStore((state) => state.placeMark)
  const setPlaceMark = useStore((state) => state.setPlaceMark)
  const placeMarkId = useStore((state) => state.placeMarkId)
  const setPlaceMarkId = useStore((state) => state.setPlaceMarkId)
  const setIsPlaceMarkActivated = useStore((state) => state.setIsPlaceMarkActivated)
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
  const commentMutatedSignal = useStore((state) => state.commentMutatedSignal)
  // eslint-disable-next-line no-unused-vars
  const {selectedPlaceMarkInNoteId, cameraHash} = useStore((state) => ({
    selectedPlaceMarkInNoteId: state.selectedPlaceMarkInNoteId,
    cameraHash: state.cameraHash,
  }))

  useEffect(() => {
    if (!selectedPlaceMarkInNoteId) {
      return
    }
    if (placeMarkGroupMap.size > 0) {
      const _marker = placeMarkGroupMap.get(Number(selectedPlaceMarkInNoteId))

      if (_marker) {
        selectPlaceMarkMarker(_marker)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaceMarkInNoteId])

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

      // HACK(pablo): clear this test tracker; this effect is being called twice,
      // but doesn't cause double-display of markers.  Should really not use this
      // out-of-band variable for testing.
      if (OAUTH_2_CLIENT_ID === 'cypresstestaudience') {
        if (!window.markerScene) {
          window.markerScene = {}
        }
        if (!window.markerScene.markerObjects) {
          window.markerScene.markerObjects = new Set
        }
        window.markerScene.markerObjects.clear()
      }
      // Loop over markers to place each one in the scene
      for (const marker of markers) {
        if (!placeMarkGroupMap.has(marker.id)) {
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
          // testing purposes
          if (OAUTH_2_CLIENT_ID === 'cypresstestaudience') {
            window.markerScene.markerObjects.add(svgGroup)
          }

          placeMarkGroupMap.set(svgGroup.userData.id, svgGroup)
        }
      }


      for (const [, value] of placeMarkGroupMap.entries()) {
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
  }, [markers, commentMutatedSignal])


  // Save a placemark
  const savePlaceMark = async ({point, normal, promiseGroup}) => {
    if (point && normal && promiseGroup) {
      const svgGroup = await promiseGroup
      const positionData = roundCoord(...point)
      const normalData = roundCoord(...normal)
      const markArr = positionData.concat(normalData)

      saveMarkToHash(markArr)
      // Add metadata to the temporary marker
      const hash = getHashParamsFromUrl(window.location.href, HASH_PREFIX_PLACE_MARK)
      const inactiveColor = MARKER_COLOR_INACTIVE
      const activeColor = MARKER_COLOR_ACTIVE
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
    setIsPlaceMarkActivated(false)

    if (!repository || !Array.isArray(notes)) {
      return
    }

    // Get the current note body and append the new placemark link
    const editMode = editModes?.[placeMarkId]
    const newCommentBody = `[placemark](${window.location.href})`
    const currentBody = editMode ? (editBodies[placeMarkId] || '') : (body || '') // Retrieve the existing body
    const updatedBody = `${currentBody}\n${newCommentBody}`

    // Set the updated body in the global store so NoteCard can use it
    if (editMode) {
      setEditBodyGlobal(placeMarkId, updatedBody)
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

  // Select a placemark
  const selectPlaceMarkMarker = (marker) => {
    assertDefined(marker)

    let foundKey = null

    for (const [key, value] of placeMarkGroupMap.entries()) {
      if (key === marker.userData.id) {
        marker.userData.isActive = true
        marker.userData.color = marker.userData.activeColor
        marker.material.color.set(marker.userData.activeColor)
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
   * @param {string} id - The marker ID
   */
  function togglePlaceMarkActive(id) {
    const deactivatePlaceMark = () => {
      if (!placeMark) {
        return
      }
      placeMark.deactivate()
      setIsPlaceMarkActivated(false)
    }

    const activatePlaceMark = () => {
      if (!placeMark) {
        return
      }
      placeMark.activate()
      setIsPlaceMarkActivated(true)
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
    let color = '#00ff00'
    if (svgGroup.userData.isActive) {
      color = 'red'
    }
    setGroupColor(svgGroup, color)
  })
}


const placeMarkGroupMap = new Map()
let prevSynchSidebar

MarkerControl.propTypes = {
  context: PropTypes.object.isRequired,
  oppositeObjects: PropTypes.array.isRequired,
  postProcessor: PropTypes.object,
}


export const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID

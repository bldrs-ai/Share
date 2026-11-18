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
import {requestPaint} from '../../viewer/three/renderDemand'
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
      // see if we have a temporary marker in the local group map. Read, not
      // a dependency: a new PlaceMark alone mustn't rewrite the location.
      const current = useStore.getState().placeMark
      const temporaryMarker = current ? markerGroupsOf(current).get(selectedPlaceMarkId) : undefined

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
    // `visible` and the colours below are no change the render-on-demand
    // hooks see (viewer/three/renderDemandHooks.js).
    requestPaint()
  }, [isNotesVisible, placeMark])


  // One PlaceMark per viewer context, released with it. A PlaceMark binds
  // its context's canvas, camera and scene for life (PlaceMark.js), and the
  // viewer is re-created in-app: on a theme change (CadView.jsx#onModelPath
  // registers initViewer as a theme listener) and on every model load. This
  // effect used to create one PlaceMark and keep it forever, so after the
  // first re-creation markers were drawn into, and raycast against, the
  // disposed viewer, which the store's PlaceMark kept reachable (#2017).
  //
  // So: a new context gets a new PlaceMark, and the old one is released
  // when its context changes or this component unmounts (it does while each
  // model loads: OperationsGroup mounts it only while `isModelReady`). The
  // store's `markers` are put down on the new one by the placement effect
  // in PlacemarkHandlers, which runs again for a new `placeMark`.
  useEffect(() => {
    if (!context) {
      debug().error('MarkerControl: context is undefined')
      return undefined
    }
    // Its per-frame upkeep runs in the viewer's own loop (PlaceMark#update,
    // ThreeContext#onFrame) until it is disposed. On a theme change the
    // first PlaceMark for the new context is short-lived: it renders while
    // the store still has the old model and `isModelReady`, and is released
    // when the reload unmounts this component a moment later. Wasted work
    // (a pass of marker textures), not a leak.
    return bindPlaceMark(createPlaceMark, {context, oppositeObjects, postProcessor})
    // Keyed on the context alone: the model and post-processor are read at
    // creation, and a model that changes under the same context is handed
    // over by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context])


  // Shift-click and double-click drop a marker on these objects (the model).
  const oppositeObject = oppositeObjects[0]
  useEffect(() => {
    if (placeMark && oppositeObject) {
      placeMark.setObjects(oppositeObjects)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeMark, oppositeObject])


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
    if (!selectedPlaceMarkInNoteId || !placeMark) {
      return
    }
    const groups = markerGroupsOf(placeMark)
    if (groups.size > 0) {
      const _marker = groups.get(Number(selectedPlaceMarkInNoteId))

      if (_marker) {
        selectPlaceMarkMarker(_marker)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaceMarkInNoteId])

  // Put the store's markers down on the PlaceMark. Every component that calls
  // this hook runs this effect (MarkerControl, ViewerContainer, NoteFooter,
  // NoteCardCreate), so the PlaceMark's own `placedFor` gate lets the first
  // one place and the rest skip, until the notes code toggles `synchSidebar`
  // for a new set of markers. A new PlaceMark (a new viewer, #2017) has
  // placed nothing, so it places the current markers again. The generation
  // check lets only the newest pass put markers down: two overlapping passes
  // (a rebind, then the notes refetch the new model starts) both used to
  // add theirs, doubling every marker.
  useEffect(() => {
    (async () => {
      if (!placeMark) {
        return
      }
      const placement = markerPlacementOf(placeMark)
      if (placement.placedFor === synchSidebar) {
        return
      }
      const isFirstPlacement = placement.placedFor === undefined
      placement.placedFor = synchSidebar
      const generation = ++placement.generation
      const isSuperseded = () => placement.generation !== generation || placeMark.isDisposed()
      const groups = placement.groups

      // dispose existing placemarks if they exist
      placeMark.disposePlaceMarks()

      groups.clear()

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
        if (!groups.has(marker.id)) {
          const svgGroup = await placeMark.putDown({
            point: new Vector3(marker.coordinates[0], marker.coordinates[1], marker.coordinates[2]),
            normal: new Vector3(marker.coordinates[3], marker.coordinates[4], marker.coordinates[5]),
            fillColor: marker.inactiveColor,
            active: marker.isActive,
          })
          if (isSuperseded()) {
            // A newer pass cleared the scene before this marker landed, or
            // the PlaceMark was released (putDown then gives null).
            if (svgGroup) {
              placeMark.disposePlaceMark(svgGroup)
              svgGroup.material.map?.dispose()
              svgGroup.material.dispose()
            }
            return
          }

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

          groups.set(svgGroup.userData.id, svgGroup)
        }
      }

      // A PlaceMark's first pass follows the store's selection when it names
      // one of these markers. That is the marker the URL shows (the hash
      // effect in MarkerControl), and for a PlaceMark rebuilt for a new
      // viewer it is the one the user had selected on the old one: a click
      // selection lives only in the old sprites and `selectedPlaceMarkId`,
      // never in `markers[].isActive`.
      const selectedId = useStore.getState().selectedPlaceMarkId
      if (isFirstPlacement && selectedId !== null && groups.has(selectedId)) {
        for (const [key, value] of groups.entries()) {
          value.userData.isActive = key === selectedId
        }
      }

      for (const [, value] of groups.entries()) {
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
      requestPaint()
    })()
    // Add markers to the dependency array so useEffect re-runs on markers
    // change, and placeMark so a new viewer's PlaceMark gets them too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, commentMutatedSignal, placeMark])


  // Save a placemark
  const savePlaceMark = async ({point, normal, promiseGroup}) => {
    if (point && normal && promiseGroup) {
      const svgGroup = await promiseGroup
      // The viewer went away while the marker's texture loaded (a theme
      // change or model load released this PlaceMark, #2017): there is no
      // marker to save, so end the placing and leave the note alone.
      if (!svgGroup || placeMark.isDisposed()) {
        setPlaceMarkMode(false)
        setIsPlaceMarkActivated(false)
        return
      }
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
      requestPaint()

      const groups = markerGroupsOf(placeMark)
      groups.set(hash, svgGroup)
      setPlaceMarkStatus(groups, svgGroup, true)
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

    for (const [key, value] of markerGroupsOf(placeMark).entries()) {
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
    requestPaint()

    if (foundKey !== null) {
      setSelectedPlaceMarkId(foundKey)
    }
  }

  // Select a placemark
  const selectPlaceMarkMarker = (marker) => {
    assertDefined(marker)

    let foundKey = null

    for (const [key, value] of markerGroupsOf(placeMark).entries()) {
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
    requestPaint()

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
   * NoteFooter's and NoteCardCreate's "Add Placemark". A no-op while a model
   * loads: MarkerControl is unmounted then, so the store has no PlaceMark
   * (#2017). A PlaceMark built while `isPlaceMarkActivated` is set starts
   * activated (createPlaceMark), so placing carries over a rebind.
   *
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
    // A viewer re-created while the user was placing a marker keeps them
    // placing: the store's flag (NoteFooter's button) outlives the PlaceMark.
    if (useStore.getState().isPlaceMarkActivated) {
      newPlaceMark.activate()
    }
    setPlaceMark(newPlaceMark)
    return newPlaceMark
  }


  return {createPlaceMark, onSceneDoubleTap, onSceneSingleTap, togglePlaceMarkActive}
}


const setPlaceMarkStatus = (groups, svgGroup, isActive) => {
  assertDefined(groups, svgGroup, isActive)
  resetPlaceMarksActive(groups, false)
  svgGroup.userData.isActive = isActive
  resetPlaceMarkColors(groups)
}


const resetPlaceMarksActive = (groups, isActive) => {
  groups.forEach((svgGroup) => {
    svgGroup.userData.isActive = isActive
  })
}


const resetPlaceMarkColors = (groups) => {
  groups.forEach((svgGroup) => {
    let color = '#00ff00'
    if (svgGroup.userData.isActive) {
      color = 'red'
    }
    setGroupColor(svgGroup, color)
  })
}


/**
 * MarkerControl's bookkeeping for one PlaceMark: its markers by id
 * (`groups`), the `synchSidebar` value it last placed for, and the newest
 * placement pass. These were module-level and so outlived every viewer:
 * the map held the first viewer's sprites, and the `synchSidebar` gate,
 * set once, kept a new viewer from ever getting its markers (#2017). Keyed
 * weakly, so a released PlaceMark takes its state with it.
 *
 * @type {WeakMap<PlaceMark, {groups: Map, placedFor: (boolean|undefined), generation: number}>}
 */
const markerPlacements = new WeakMap()


/**
 * @param {PlaceMark} placeMark
 * @return {{groups: Map, placedFor: (boolean|undefined), generation: number}}
 */
function markerPlacementOf(placeMark) {
  let placement = markerPlacements.get(placeMark)
  if (!placement) {
    placement = {groups: new Map(), placedFor: undefined, generation: 0}
    markerPlacements.set(placeMark, placement)
  }
  return placement
}


/**
 * @param {PlaceMark} placeMark
 * @return {Map} the PlaceMark's markers, by note or comment id
 */
export function markerGroupsOf(placeMark) {
  return markerPlacementOf(placeMark).groups
}


/**
 * Create a PlaceMark and return the cleanup that releases it.
 *
 * Outside the component on purpose. React keeps an effect's cleanup until
 * the effect runs again, and a closure made in the render keeps that
 * render's whole V8 context: here, the `placeMark` the store held while
 * rendering for the new context, which is the old PlaceMark. A cleanup made
 * here closes over the new PlaceMark alone (the unit test's forced GC fails
 * without this).
 *
 * @param {Function} createPlaceMark PlacemarkHandlers#createPlaceMark
 * @param {object} args Its arguments
 * @return {Function} the effect cleanup
 */
function bindPlaceMark(createPlaceMark, args) {
  const boundPlaceMark = createPlaceMark(args)
  return () => releasePlaceMark(boundPlaceMark)
}


/**
 * Release a PlaceMark whose viewer is going away: take it out of the store
 * if it is still the store's, forget the Playwright build's handles on its
 * markers, and dispose it (frame upkeep, sprites, materials, textures and
 * the viewer refs; PlaceMark#dispose).
 *
 * @param {PlaceMark} placeMark
 */
export function releasePlaceMark(placeMark) {
  const {placeMark: current, setPlaceMark} = useStore.getState()
  if (current === placeMark) {
    setPlaceMark(null)
  }
  const markerObjects = window.markerScene?.markerObjects
  if (markerObjects) {
    for (const sprite of placeMark.getPlacemarks()) {
      markerObjects.delete(sprite)
    }
  }
  // Bump the generation so a placement pass still awaiting a texture drops
  // its marker instead of adding it to the released PlaceMark's list.
  const placement = markerPlacements.get(placeMark)
  if (placement) {
    placement.generation++
    placement.groups.clear()
  }
  markerPlacements.delete(placeMark)
  placeMark.dispose()
}

MarkerControl.propTypes = {
  context: PropTypes.object.isRequired,
  oppositeObjects: PropTypes.array.isRequired,
  postProcessor: PropTypes.object,
}


export const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID

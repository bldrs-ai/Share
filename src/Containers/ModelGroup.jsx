import React from 'react'
import ElementGroup from '../Components/ElementGroup'
import useStore from '../store/useStore'
import ControlsGroupAndDrawer from './ControlsGroupAndDrawer'
import OperationsGroupAndDrawer from './OperationsGroupAndDrawer'
import ViewerContainer from './ViewerContainer'


/** @return {React.ReactElement} */
export default function ModelGroup() {
  // AppSlice
  const pathPrefix = useStore((state) => state.pathPrefix)

  // IFCSlice
  const viewer = useStore((state) => state.viewer)

  // NavTreeSlice
  // const selectedElements = useStore((state) => state.selectedElements)
  // const setSelectedElements = useStore((state) => state.setSelectedElements)

  // UISlice
  // const setCutPlaneDirections = useStore((state) => state.setCutPlaneDirections)
  // const setLevelInstance = useStore((state) => state.setLevelInstance)


  /** Clear current selection. */
  /*function resetSelection(viewer) {
    if (selectedElements?.length !== 0) {
      selectItemsInScene(viewer, [])
    }
  }*/


  /** Reset global state */
  /*function resetState() {
    resetSelection()
    setCutPlaneDirections([])
    setLevelInstance(null)
  }*/


  /** Deselect active scene elts and remove clip planes. */
  /*function deselectItems() {
    if (viewer) {
      viewer.clipper.deleteAllPlanes()
    }
    resetState()
    const repoFilePath = modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath
    window.removeEventListener('beforeunload', handleBeforeUnload)
    navWith(navigate, `${pathPrefix}${repoFilePath}`, {search: '', hash: ''})
  }*/


  const deselectItems = () => {console.warn('todo')}
  const selectWithShiftClickEvents = () => {console.warn('todo')}

  return (
    <>
      <ViewerContainer/>
      {viewer && (
        <>
          <ControlsGroupAndDrawer
            pathPrefix={pathPrefix}
            deselectItems={deselectItems}
            selectWithShiftClickEvents={selectWithShiftClickEvents}
          />
          <OperationsGroupAndDrawer deselectItems={deselectItems}/>
          <ElementGroup deselectItems={deselectItems}/>
        </>)}
    </>
  )
}

import {useEffect} from 'react'
import useStore from '../store/useStore'
import {getPathIdsForElements} from './model'


/** */
export default function useNavTree(elementsById, elementTypesMap) {
  // IFCSlice
  const viewer = useStore((state) => state.viewer)

  // NavTreeSlice
  const expandedTypes = useStore((state) => state.expandedTypes)
  const selectedElements = useStore((state) => state.selectedElements)
  const setExpandedElements = useStore((state) => state.setExpandedElements)
  const setExpandedTypes = useStore((state) => state.setExpandedTypes)
  const setSelectedElement = useStore((state) => state.setSelectedElement)


  useEffect(() => {
    (async () => {
      if (!Array.isArray(selectedElements) || !viewer) {
        return
      }
      // Update The selection on the scene pick/unpick
      const ids = selectedElements.map((id) => parseInt(id))
      await viewer.setSelection(0, ids)
      // If current selection is not empty
      if (selectedElements.length > 0) {
        // Display the properties of the last one,
        const lastId = selectedElements.slice(-1)
        const props = await viewer.getProperties(0, Number(lastId))
        setSelectedElement(props)
        // Update the expanded elements in NavTreePanel
        const pathIds = getPathIdsForElements(lastId, elementsById)
        if (pathIds) {
          setExpandedElements(pathIds.map((n) => `${n}`))
        }
        const types = elementTypesMap
              .filter((t) => t.elements.filter((e) => ids.includes(e.expressID)).length > 0)
              .map((t) => t.name)
        if (types.length > 0) {
          setExpandedTypes([...new Set(types.concat(expandedTypes))])
        }
      } else {
        setSelectedElement(null)
      }
    })()
  }, [elementTypesMap, elementsById, expandedTypes,
      selectedElements,
      setExpandedElements, setExpandedTypes, setSelectedElement, viewer])
}

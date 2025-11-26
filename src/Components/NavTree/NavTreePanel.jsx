import PropTypes from 'prop-types'
import React, {ReactElement, useEffect, useState, useRef, useCallback} from 'react'
import {VariableSizeList} from 'react-window'
import {reifyName} from '@bldrs-ai/ifclib'
import {AccountTree as AccountTreeIcon, List as ListIcon} from '@mui/icons-material'
import {ToggleButton, ToggleButtonGroup, Tooltip} from '@mui/material'
import {styled} from '@mui/material/styles'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import Panel from '../SideDrawer/Panel'
import NavTreeNode from './NavTreeNode'
import {removeHashParams} from './hashState'


/**
 * Nav tree panel component
 *
 * @return {ReactElement}
 */
export default function NavTreePanel({
  model,
  pathPrefix,
  selectWithShiftClickEvents,
}) {
  assertDefined(model, pathPrefix, selectWithShiftClickEvents)

  // State hooks and store selectors
  const elementTypesMap = useStore((state) => state.elementTypesMap)
  const expandedElements = useStore((state) => state.expandedElements)
  const expandedTypes = useStore((state) => state.expandedTypes)
  const setIsNavTreeVisible = useStore((state) => state.setIsNavTreeVisible)
  const rootElement = useStore((state) => state.rootElement)
  const selectedElements = useStore((state) => state.selectedElements)
  const setExpandedElements = useStore((state) => state.setExpandedElements)
  const setExpandedTypes = useStore((state) => state.setExpandedTypes)
  const viewer = useStore((state) => state.viewer)
  const itemDefaultHeight = 24

  const [navigationMode, setNavigationMode] = useState('spatial-tree')
  const isNavTree = navigationMode === 'spatial-tree'

  // Track which nodes have loaded their geometric parts
  const [loadedParts, setLoadedParts] = useState({})

  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // eslint-disable-next-line no-unused-vars
        const {width, height} = entry.contentRect
        setContainerWidth(width)
      }
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      if (containerRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        resizeObserver.unobserve(containerRef.current)
      }
    }
  }, [])


  /** Hide panel and remove hash state */
  function onClose() {
    setIsNavTreeVisible(false)
    removeHashParams()
  }

  const listRef = useRef(null)

  const expandedNodeIds = isNavTree ? expandedElements : expandedTypes
  const setExpandedNodeIds = isNavTree ? setExpandedElements : setExpandedTypes
  const treeData = isNavTree ? rootElement : elementTypesMap

  const [visibleNodes, setVisibleNodes] = useState([])

  // Map to store item heights
  const itemHeights = useRef({})

  // Flatten the tree into a list of visible nodes
  useEffect(() => {
    const nodes = getVisibleNodes(treeData, expandedNodeIds, isNavTree, model, viewer, loadedParts)
    setVisibleNodes(nodes)
  }, [treeData, expandedNodeIds, isNavTree, model, loadedParts, viewer])

  // Scroll to selected element
  useEffect(() => {
    const nodeId = selectedElements[0]
    if (nodeId) {
      const index = visibleNodes.findIndex(
        ({node}) => node.expressID && node.expressID.toString() === nodeId,
      )
      if (index >= 0 && listRef.current) {
        listRef.current.scrollToItem(index, 'center')
      }
    }
  }, [selectedElements, visibleNodes])

  // Function to get item size
  const getItemSize = useCallback(
    (index) => {
      // Return the height for this item from the itemHeights map
      return itemHeights.current[index] || itemDefaultHeight
    },
    [],
  )

  // Function to set item size after measuring
  const setItemSize = (index, size) => {
    if (itemHeights.current[index] !== size) {
      itemHeights.current = {...itemHeights.current, [index]: size}
      listRef.current.resetAfterIndex(index)
    }
  }

  return (
    <Panel
      title={TITLE}
      actions={
        <Actions
          navigationMode={navigationMode}
          setNavigationMode={setNavigationMode}
        />
      }
      onClose={onClose}
      data-testid="NavTreePanel"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%', // Allow the panel to fill its parent container
      }}
    >
      <div
        ref={containerRef}
        style={{
          flexGrow: 1,
          overflowY: 'visible', // Allow vertical scrolling for overflow
          overflowX: 'hidden', // Keep horizontal overflow hidden if needed
          height: '100%',
        }}
      >
        {containerWidth > 0 && (
          <VariableSizeList
            ref={listRef}
            height={containerRef.current.clientHeight} // Dynamically set height
            width={containerWidth} // Dynamically set width
            itemCount={visibleNodes.length}
            itemSize={getItemSize}
            itemData={{
              visibleNodes,
              expandedNodeIds,
              setExpandedNodeIds,
              selectedNodeIds: selectedElements,
              selectWithShiftClickEvents,
              model,
              viewer,
              setItemSize,
              isNavTree,
              loadedParts,
              setLoadedParts,
            }}
          >
            {RenderRow}
          </VariableSizeList>
        )}
      </div>
    </Panel>
  )
}

/**
 * Get visible nodes
 *
 * @param {Array} treeData - The tree data
 * @param {Array} expandedNodeIds - IDs of expanded nodes
 * @param {boolean} isNavTree - Whether this is a nav tree
 * @param {object} model - The model object
 * @param {object} viewer - The viewer instance
 * @param {object} loadedParts - Map of expressID to loaded geometric parts
 * @return {Array} nodes
 */
function getVisibleNodes(treeData, expandedNodeIds, isNavTree, model, viewer, loadedParts = {}) {
  const visibleNodes = []

  /**
   * traverse nodes
   *
   * @param {object} node - The node to traverse
   * @param {number} depth - Current depth
   */
  function traverse(node, depth) {
    visibleNodes.push({node, depth})

    if (expandedNodeIds.includes(node.nodeId) && node.children) {
      for (const child of node.children) {
        traverse(child, depth + 1)
      }
    }
  }

  /**
   * Check if a node has geometric parts by inspecting its flat mesh
   *
   * @param {number} expressID - The express ID to check
   * @return {boolean} - True if the node has multiple geometric parts
   */
  function hasMultipleGeometricParts(expressID) {
    if (!viewer) {
      return false
    }
    const ifcAPI = viewer?.IFC?.loader?.ifcManager?.ifcAPI
    if (!ifcAPI?.GetFlatMesh) {
      return false
    }
    try {
      // eslint-disable-next-line new-cap
      const flatMesh = ifcAPI.GetFlatMesh(0, expressID)
      const geometries = flatMesh?.geometries
      const size = typeof geometries?.size === 'function' ? geometries.size() : 0
      return size > 1
    } catch (error) {
      return false
    }
  }

  /**
   * map the spatial nodes
   *
   * @param {object} node - The node to map
   * @return {object} node
   */
  function mapSpatialNode(node) {
    const nodeId = node.expressID.toString()
    const parts = loadedParts[nodeId]
    const baseChildren = node.children ? node.children.map(mapSpatialNode) : []

    // Add geometric parts if they've been loaded
    const geometricParts = parts ? parts.map((part, idx) => ({
      nodeId: part.expressID.toString(),
      label: part.label,
      expressID: part.expressID, // The actual part's expressID
      parentExpressID: part.parentExpressID,
      partIndex: part.partIndex,
      hasChildren: false,
      children: [],
      isGeometricPart: true,
    })) : []

    const allChildren = [...baseChildren, ...geometricParts]

    // Determine if this node could have geometric parts to load
    // Check if it's a leaf node that might have multiple geometric parts
    const couldHaveParts = node.expressID !== undefined &&
                          !parts && // Haven't loaded parts yet
                          baseChildren.length === 0 && // Only leaf nodes can have geometric parts
                          hasMultipleGeometricParts(node.expressID)

    return {
      nodeId,
      label: reifyName({properties: model}, node),
      expressID: node.expressID,
      hasChildren: allChildren.length > 0 || couldHaveParts,
      hasGeometricParts: couldHaveParts,
      children: allChildren,
    }
  }

  if (isNavTree) {
    const mappedTreeData = mapSpatialNode(treeData)
    traverse(mappedTreeData, 0)
  } else {
    // Types tree
    const mappedTreeData = treeData.map((type) => ({
      nodeId: type.name,
      label: type.name,
      hasChildren: true,
      children: type.elements.map((elt) => ({
        nodeId: elt.expressID.toString(),
        label: reifyName({properties: model}, elt),
        expressID: elt.expressID,
        hasChildren: false,
        children: [],
      })),
    }))
    mappedTreeData.forEach((node) => traverse(node, 0))
  }

  return visibleNodes
}

// Row renderer for VariableSizeList
const RenderRow = ({index, style, data}) => {
  const {
    visibleNodes,
    expandedNodeIds,
    setExpandedNodeIds,
    selectedNodeIds,
    selectWithShiftClickEvents,
    model,
    viewer,
    setItemSize,
    isNavTree,
    loadedParts,
    setLoadedParts,
  } = data

  const {node, depth} = visibleNodes[index]
  const nodeId = node.nodeId
  const isExpanded = expandedNodeIds.includes(nodeId)
  const hasChildren = node.hasChildren
  let isSelected = false

  // Check if this node is selected by its expressID
  if (node.expressID) {
    const expressIDStr = node.expressID.toString()
    isSelected = selectedNodeIds.includes(expressIDStr)
  }

  const rowRef = useRef(null)
  const itemDefaultHeight = 24

  useEffect(() => {
    if (rowRef.current) {
      const labelElement = rowRef.current.querySelector('[id="NavTreeNodeLabelId"]')
      if (labelElement) {
        const computedStyle = window.getComputedStyle(labelElement)
        const lineHeight = parseFloat(computedStyle.lineHeight) || itemDefaultHeight

        // Measure actual height
        const actualHeight = labelElement.getBoundingClientRect().height

        // Calculate number of lines
        const numberOfLines = Math.ceil(actualHeight / lineHeight)

        // Calculate new height
        const newHeight = numberOfLines * lineHeight

        // Update the item size
        setItemSize(index, newHeight)
      }
    }
  }, [index, setItemSize, node.label, model])


  const handleToggle = async (event) => {
    event.stopPropagation()
    if (isExpanded) {
      setExpandedNodeIds(expandedNodeIds.filter((id) => id !== nodeId))
    } else {
      // Expand the node first
      setExpandedNodeIds([...expandedNodeIds, nodeId])

      // Check if we need to lazy load geometric parts
      if (isNavTree && node.hasGeometricParts && !loadedParts[nodeId] && model?.ifcManager) {
        try {
          const props = await model.ifcManager.getItemProperties(0, node.expressID, true)
          const parts = []
          const representations = props?.Representation?.Representations || []

          for (const rep of representations) {
            const isBody = rep?.RepresentationIdentifier?.value === 'Body'
            const items = Array.isArray(rep?.Items) ? rep.Items : []
            if (!isBody || items.length <= 1) {
              continue
            }

            const placedGeometryIds = viewer ? getPlacedGeometryExpressIds(viewer, node.expressID) : []
            items.forEach((item, idx) => {
              if (typeof item?.expressID !== 'number') {
                return
              }
              const geometryExpressID = Number.isFinite(placedGeometryIds[idx]) ? placedGeometryIds[idx] : item.expressID
              parts.push({
                label: `Part ${idx + 1}`,
                parentExpressID: node.expressID,
                partIndex: idx,
                expressID: item.expressID,
              })
              viewer?.registerGeometricPart(item.expressID, {
                parentExpressID: node.expressID,
                modelID: 0,
                partIndex: idx,
                geometryExpressID,
              })
            })
            break
          }

          setLoadedParts((prev) => ({...prev, [nodeId]: parts}))
        } catch (error) {
          console.warn('Failed to load geometric parts for node:', nodeId, error)
          setLoadedParts((prev) => ({...prev, [nodeId]: []}))
        }
      }
    }
  }

  const handleSelect = (event) => {
    if (hasChildren && !isNavTree) {
      // Selecting a type node in the types tree
      const elementIds = node.children.map((child) => child.expressID.toString())
      selectWithShiftClickEvents(event.shiftKey, elementIds)
    } else if (node.expressID) {
      selectWithShiftClickEvents(event.shiftKey, node.expressID.toString())
    }
  }

  let hasHideIcon = false
  if (node.expressID) {
    hasHideIcon = viewer.isolator.canBeHidden(node.expressID)
  }

  return (
    <div ref={rowRef} style={{...style}}>
      <NavTreeNode
        node={node}
        depth={depth}
        isExpanded={isExpanded}
        isSelected={isSelected}
        hasChildren={hasChildren}
        handleToggle={handleToggle}
        handleSelect={handleSelect}
        hasHideIcon={hasHideIcon}
        model={model}
        style={{}}
        isNavTree={isNavTree}
      />
    </div>
  )
}


/**
 * Get placed geometry express IDs
 *
 * @param {object} viewer - The viewer instance
 * @param {number} parentExpressID - The parent express ID
 * @return {Array<number>} - Array of placed geometry express IDs
 */
function getPlacedGeometryExpressIds(viewer, parentExpressID) {
  const ifcAPI = viewer?.IFC?.loader?.ifcManager?.ifcAPI
  if (!ifcAPI?.GetFlatMesh) {
    return []
  }
  try {
    // eslint-disable-next-line new-cap
    const flatMesh = ifcAPI.GetFlatMesh(0, parentExpressID)
    const geometries = flatMesh?.geometries
    const size = typeof geometries?.size === 'function' ? geometries.size() : 0
    if (!size) {
      return []
    }
    const geometryExpressIds = []
    for (let idx = 0; idx < size; idx += 1) {
      const placedGeometry = geometries.get(idx)
      const geometryExpressID = placedGeometry?.geometryExpressID
      geometryExpressIds.push(Number.isFinite(geometryExpressID) ? geometryExpressID : null)
    }
    return geometryExpressIds
  } catch (error) {
    console.warn('Failed to resolve placed geometries for element', parentExpressID, error)
    return []
  }
}

/**
 * Actions component
 *
 * @return {ReactElement}
 */
function Actions({navigationMode, setNavigationMode}) {
  const StyledToggleButtonGroup = styled(ToggleButtonGroup)(() => ({
    '& .MuiToggleButtonGroup-grouped': {
      'border': 0,
      'borderRadius': 0,
      '&.Mui-disabled': {
        border: 0,
      },
    },
  }))


  return (
    <StyledToggleButtonGroup
      value={navigationMode}
      onChange={(event, value) => {
        if (value !== null) {
          setNavigationMode(value)
        }
      }}
      exclusive
      size="small"
    >
      <ToggleButton value="spatial-tree" aria-label="spatial-tree" size="small">
        <Tooltip title="Spatial Structure" placement="top" describeChild>
          <AccountTreeIcon className="icon-share"/>
        </Tooltip>
      </ToggleButton>
      <ToggleButton value="element-types" aria-label="element-types" size="small">
        <Tooltip title="Element Types" placement="top" describeChild>
          <ListIcon className="icon-share"/>
        </Tooltip>
      </ToggleButton>
    </StyledToggleButtonGroup>
  )
}


export const TITLE = 'Navigation'

NavTreePanel.propTypes = {
  model: PropTypes.object.isRequired,
  pathPrefix: PropTypes.string,
  selectWithShiftClickEvents: PropTypes.func.isRequired,
}

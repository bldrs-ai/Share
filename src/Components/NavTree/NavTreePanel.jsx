import PropTypes from 'prop-types'
import React, {ReactElement, useEffect, useState, useRef, useCallback} from 'react'
import {VariableSizeList} from 'react-window'
import {reifyName} from '@bldrs-ai/ifclib'
import {AccountTree as AccountTreeIcon, List as ListIcon} from '@mui/icons-material'
import {ToggleButton, ToggleButtonGroup, Tooltip} from '@mui/material'
import {styled} from '@mui/material/styles'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import {occurrencePathKey} from '../../utils/occurrencePaths'
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
  const selectedOccurrencePath = useStore((state) => state.selectedOccurrencePath)
  const setExpandedElements = useStore((state) => state.setExpandedElements)
  const setExpandedTypes = useStore((state) => state.setExpandedTypes)
  const viewer = useStore((state) => state.viewer)
  const itemDefaultHeight = 24

  // Canonical key of the selected occurrence path, computed once per render and
  // threaded to every row — the per-row `isSelected` check and the scroll
  // effect both compare against it, so joining it here avoids re-joining the
  // (invariant) selected path for each of the many visible rows.
  const selectedOccurrencePathKey =
    selectedOccurrencePath && selectedOccurrencePath.length > 0 ?
      occurrencePathKey(selectedOccurrencePath) : null

  const [navigationMode, setNavigationMode] = useState('spatial-tree')
  const isNavTree = navigationMode === 'spatial-tree'

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
    const nodes = getVisibleNodes(treeData, expandedNodeIds, isNavTree, model)
    setVisibleNodes(nodes)
  }, [treeData, expandedNodeIds, isNavTree, model])

  // Scroll to selected element
  useEffect(() => {
    let index = -1
    // STEP: a scene pick reports the geometry's owner id
    // (product_definition_shape), which never equals a tree node's id (its NAUO
    // express id) — the shared occurrence path is the only reliable join, so
    // prefer it. Falls back to expressID for IFC and when no occurrence is set.
    if (selectedOccurrencePathKey !== null) {
      index = visibleNodes.findIndex(
        ({node}) => Array.isArray(node.occurrencePath) &&
          occurrencePathKey(node.occurrencePath) === selectedOccurrencePathKey,
      )
    }
    if (index < 0) {
      const nodeId = selectedElements[0]
      if (nodeId) {
        index = visibleNodes.findIndex(
          ({node}) => node.expressID && node.expressID.toString() === nodeId,
        )
      }
    }
    if (index >= 0 && listRef.current) {
      listRef.current.scrollToItem(index, 'center')
    }
  }, [selectedElements, selectedOccurrencePathKey, visibleNodes])

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
              selectedOccurrencePathKey,
              selectWithShiftClickEvents,
              model,
              viewer,
              setItemSize,
              isNavTree,
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
 * @return {Array} nodes
 */
function getVisibleNodes(treeData, expandedNodeIds, isNavTree, model) {
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
   * map the spatial nodes
   *
   * Children with undefined `expressID` are filtered out (they can't
   * be addressed by URL / selection anyway). Spotted on a deploy-
   * preview cache-hit GLB whose `BLDRS_spatial_tree` extension was
   * written during a transient capture failure; rather than crashing
   * the whole panel with `Cannot read properties of undefined`, the
   * tree renders without the malformed nodes and the user can still
   * interact with the rest of the hierarchy.
   *
   * @param {object} node - The node to map
   * @return {object} node
   */
  function mapSpatialNode(node) {
    const childArray = Array.isArray(node.children) ?
      node.children.filter((c) => c && c.expressID !== undefined) :
      []
    const mapped = {
      nodeId: node.expressID.toString(),
      label: reifyName({properties: model}, node),
      expressID: node.expressID,
      hasChildren: childArray.length > 0,
      children: childArray.map(mapSpatialNode),
    }
    // Preserve the STEP occurrence path (NAUO express ids) so RenderRow's
    // `isSelected` and the scroll effect can distinguish a reused part's
    // occurrences — the scalar `expressID` collides across them, so without
    // this a single-node click / pick highlights every reuse. Absent for IFC.
    if (Array.isArray(node.occurrencePath)) {
      mapped.occurrencePath = node.occurrencePath
    }
    return mapped
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
    selectedOccurrencePathKey,
    selectWithShiftClickEvents,
    model,
    viewer,
    setItemSize,
    isNavTree,
  } = data

  const {node, depth} = visibleNodes[index]
  const nodeId = node.nodeId
  const isExpanded = expandedNodeIds.includes(nodeId)
  const hasChildren = node.hasChildren
  let isSelected = false

  if (!hasChildren) {
    // STEP: match on the occurrence path when one is selected — it's the only
    // key shared with the geometry side (a scene pick reports the part-type's
    // product_definition_shape id, which never equals this node's NAUO express
    // id), and it uniquely identifies one occurrence so a reused part lights up
    // only the clicked/picked node, not every reuse. Falls back to expressID for
    // IFC and when no occurrence is selected (selectedOccurrencePathKey is null).
    if (selectedOccurrencePathKey !== null && Array.isArray(node.occurrencePath)) {
      isSelected = occurrencePathKey(node.occurrencePath) === selectedOccurrencePathKey
    } else {
      isSelected = selectedNodeIds.includes(node.expressID.toString())
    }
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


  const handleToggle = (event) => {
    event.stopPropagation()
    if (isExpanded) {
      setExpandedNodeIds(expandedNodeIds.filter((id) => id !== nodeId))
    } else {
      setExpandedNodeIds([...expandedNodeIds, nodeId])
    }
  }

  const handleSelect = (event) => {
    if (hasChildren && !isNavTree) {
      // Selecting a type node in the types tree
      const elementIds = node.children.map((child) => child.expressID.toString())
      selectWithShiftClickEvents(event.shiftKey, elementIds)
    } else if (node.expressID) {
      // Pass the STEP occurrence path so clicking one occurrence of a reused
      // part highlights only that node, not every node sharing the expressID.
      // Undefined for IFC — selection stays keyed on the expressID alone.
      // `hasChildren` lets the scene-highlight resolver pick its lookup: a leaf
      // takes the O(1) exact path, an assembly needs the descendant scan.
      selectWithShiftClickEvents(
        event.shiftKey, node.expressID.toString(), node.occurrencePath, hasChildren)
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

import React, {useEffect, useState, useRef, useCallback} from 'react'
import {VariableSizeList} from 'react-window'
import useTheme from '@mui/styles/useTheme'
import {styled} from '@mui/material/styles'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import Panel from '../SideDrawer/Panel'
import ListIcon from '@mui/icons-material/List'
import {removeHashParams} from './hashState'
import NavTreeNode from './NavTreeNode'
import PropTypes from 'prop-types'
import {reifyName} from '@bldrs-ai/ifclib'

/**
 * Nav tree panel component
 *
 * @return {React.Component}
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

  const theme = useTheme()

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
              theme,
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
 * @return {Array} nodes
 */
function getVisibleNodes(treeData, expandedNodeIds, isNavTree, model) {
  const visibleNodes = []

  /**
   * traverse nodes
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
   * @return {object} node
   */
  function mapSpatialNode(node) {
    return {
      nodeId: node.expressID.toString(),
      label: reifyName({properties: model}, node),
      expressID: node.expressID,
      hasChildren: node.children && node.children.length > 0,
      children: node.children ? node.children.map(mapSpatialNode) : [],
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
    theme,
    setItemSize,
    isNavTree,
  } = data

  const {node, depth} = visibleNodes[index]
  const nodeId = node.nodeId
  const isExpanded = expandedNodeIds.includes(nodeId)
  const hasChildren = node.hasChildren
  let isSelected = false

  if (!hasChildren) {
    // For element nodes
    isSelected = selectedNodeIds.includes(node.expressID.toString())
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
        theme={theme}
        style={{}}
        isNavTree={isNavTree}
      />
    </div>
  )
}

/**
 * Actions component
 *
 * @return {React.Component}
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

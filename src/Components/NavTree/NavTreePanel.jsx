import PropTypes from 'prop-types'
import React, {ReactElement, useEffect, useState, useRef, useCallback} from 'react'
import {VariableSizeList} from 'react-window'
import {reifyName} from '@bldrs-ai/ifclib'
import {AccountTree as AccountTreeIcon, List as ListIcon} from '@mui/icons-material'
import {ToggleButton, ToggleButtonGroup, Tooltip} from '@mui/material'
import {styled} from '@mui/material/styles'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import {labelForGeometryId} from '../../utils/geometryLabels'
import {occurrencePathKey} from '../../utils/occurrencePaths'
import Panel from '../SideDrawer/Panel'
import NavTreeNode from './NavTreeNode'
import {removeHashParams} from './hashState'


// Transient rows materialized per "N more…" click (conway#387). Large
// anonymous sets (an ECAD board's hundreds of pieces) arrive in chunks the
// virtualized list absorbs without a hitch; the row retires when the
// advisory remaining count reaches zero.
const MORE_ROW_BATCH_SIZE = 250


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
  const selectedSolidExpressId = useStore((state) => state.selectedSolidExpressId)
  const transientTreeNodes = useStore((state) => state.transientTreeNodes)
  const addTransientTreeNodes = useStore((state) => state.addTransientTreeNodes)
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
    const nodes = getVisibleNodes(treeData, expandedNodeIds, isNavTree, model, transientTreeNodes)
    setVisibleNodes(nodes)
  }, [treeData, expandedNodeIds, isNavTree, model, transientTreeNodes])

  // Scroll to selected element
  useEffect(() => {
    let index = -1
    // STEP: a scene pick reports the geometry's owner id
    // (product_definition_shape), which never equals a tree node's id (its NAUO
    // express id) — the shared occurrence path is the only reliable join, so
    // prefer it. A multibody part's ephemeral solid rows share the part's
    // path, so within the path match the solid id decides: a solid selection
    // scrolls to its own row, a part selection to the (non-ephemeral) part
    // row. Falls back to expressID for IFC and when no occurrence is set.
    if (selectedOccurrencePathKey !== null) {
      index = visibleNodes.findIndex(
        ({node}) => Array.isArray(node.occurrencePath) &&
          occurrencePathKey(node.occurrencePath) === selectedOccurrencePathKey &&
          (selectedSolidExpressId !== null ?
            (node.ephemeral === true && node.expressID === selectedSolidExpressId) :
            node.ephemeral !== true),
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
  }, [selectedElements, selectedOccurrencePathKey, selectedSolidExpressId, visibleNodes])

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
              selectedSolidExpressId,
              selectWithShiftClickEvents,
              addTransientTreeNodes,
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
 * Display-order comparator for scenegraph-tree siblings: plain UTF-16
 * ordinal comparison on the label, i.e. lexicographic with capitals
 * first (uppercase < '_' < lowercase in ASCII). On authored GLBs this
 * ranks real names above underscore-prefixed exporter scaffolding —
 * e.g. NASA's ISS model (#1595) lists "ECOStress", "OCO3", … above
 * "_root" and the lowercase panel/hinge noise, matching how the
 * three.js editor presents it. Deliberately NOT localeCompare: locale
 * collation is case-insensitive-ish and locale-dependent, which would
 * lose the caps-first property and make order vary per user.
 *
 * @param {object} a mapped node with a `label`
 * @param {object} b mapped node with a `label`
 * @return {number}
 */
export function compareNodeLabels(a, b) {
  const la = typeof a?.label === 'string' ? a.label : ''
  const lb = typeof b?.label === 'string' ? b.label : ''
  if (la < lb) {
    return -1
  }
  return la > lb ? 1 : 0
}


/**
 * Get visible nodes
 *
 * @param {Array} treeData - The tree data
 * @param {Array} expandedNodeIds - IDs of expanded nodes
 * @param {boolean} isNavTree - Whether this is a nav tree
 * @param {object} model - The model object
 * @param {object} [transientTreeNodes] - Session-only anonymous-geometry rows
 *   (conway#387), keyed by parent occurrence-path key
 * @return {Array} nodes
 */
function getVisibleNodes(treeData, expandedNodeIds, isNavTree, model, transientTreeNodes = {}) {
  const visibleNodes = []

  // Ordering policy discriminant. An IFC / STEP spatial structure (live
  // parse, Conway-direct, or BLDRS_spatial_tree cache-hit) arrives as
  // plain JS objects whose sibling order is meaningful — storeys in
  // elevation order, STEP occurrence order — so it renders as-is. A
  // raw scenegraph tree (plain GLB / OBJ / FBX: `convertToShareModel`
  // hands the Object3D hierarchy itself to the NavTree) carries only
  // authoring-tool insertion order, so its siblings sort by label via
  // `compareNodeLabels` instead. `isObject3D` is three.js's own marker
  // and never appears on the IFC-shaped trees.
  const isSceneGraphTree = treeData?.isObject3D === true

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
    const mappedChildren = childArray.map(mapSpatialNode)
    if (isSceneGraphTree) {
      // Stable sort: unnamed siblings (shared 'Object' placeholder
      // label) keep their scenegraph order relative to each other.
      mappedChildren.sort(compareNodeLabels)
    }
    const mapped = {
      nodeId: node.expressID.toString(),
      label: reifyName({properties: model}, node),
      expressID: node.expressID,
      hasChildren: childArray.length > 0,
      children: mappedChildren,
    }
    // Preserve the STEP occurrence path (NAUO express ids) so RenderRow's
    // `isSelected` and the scroll effect can distinguish a reused part's
    // occurrences — the scalar `expressID` collides across them, so without
    // this a single-node click / pick highlights every reuse. Absent for IFC.
    if (Array.isArray(node.occurrencePath)) {
      mapped.occurrencePath = node.occurrencePath
    }
    // Preserve the ephemeral-solid marker (a multibody part's named body).
    // Solid rows share the parent part's occurrence path, so `isSelected`,
    // the scroll effect, and the click funnel all need this to tell "the
    // part" from "one body inside it". Absent for products and IFC.
    if (node.ephemeral === true) {
      mapped.ephemeral = true
    }
    // Anonymous-geometry affordances (conway#387). Both are session-only
    // and reconstructed on the fly — nothing here persists to the cache.
    if (Array.isArray(node.occurrencePath) && node.occurrencePath.length > 0) {
      const pathKey = occurrencePathKey(node.occurrencePath)
      // Transient rows: pieces a pick / permalink / "more" expansion
      // materialized under this part. Rendered as ephemeral solid rows —
      // (path, geometry id) drives highlight/scroll/eye exactly like the
      // engine-emitted solid nodes — with a path-scoped nodeId so reused
      // parts don't alias expansion state.
      const transientRows = (transientTreeNodes[pathKey] ?? [])
        .filter((row) => !mapped.children.some((child) => child.expressID === row.expressID))
        .map((row) => ({
          nodeId: `${pathKey}:${row.expressID}`,
          label: row.label,
          expressID: row.expressID,
          hasChildren: false,
          children: [],
          occurrencePath: node.occurrencePath,
          ephemeral: true,
          transient: true,
        }))
      if (transientRows.length > 0) {
        mapped.children = [...mapped.children, ...transientRows]
        mapped.hasChildren = true
      }
      // "N more…" expansion row: the engine reported suppressed solids
      // (`droppedSolids`) that have no nodes; clicking materializes the next
      // batch from the instance map. The remaining count is advisory — the
      // enumeration can also surface face pieces the solid count never
      // included — and the row retires when it reaches zero.
      const materialized = transientRows.length
      const remaining = Math.max((node.droppedSolids ?? 0) - materialized, 0)
      if (remaining > 0) {
        const knownIds = mapped.children.map((child) => child.expressID)
        mapped.children = [...mapped.children, {
          nodeId: `${pathKey}:__more`,
          isMoreRow: true,
          remaining,
          parentPath: node.occurrencePath,
          knownIds,
          hasChildren: false,
          children: [],
        }]
        mapped.hasChildren = true
      }
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
    selectedSolidExpressId,
    selectWithShiftClickEvents,
    addTransientTreeNodes,
    model,
    viewer,
    setItemSize,
    isNavTree,
  } = data

  const {node, depth} = visibleNodes[index]
  const nodeId = node.nodeId
  const isExpanded = expandedNodeIds.includes(nodeId)

  // "N more…" expansion row for anonymous below-product geometry
  // (conway#387): clicking materializes the next batch of pieces from the
  // instance map as transient rows. Labels resolve through Conway's
  // arbitrary-id lookup asynchronously; the store dedups against pieces
  // that already arrived from a pick or permalink.
  const handleMoreClick = () => {
    if (typeof viewer?.getGeometryIdsForOccurrencePath !== 'function') {
      return
    }
    const known = new Set(node.knownIds)
    const fresh = viewer.getGeometryIdsForOccurrencePath(0, node.parentPath)
      .filter((geometryExpressId) => !known.has(geometryExpressId))
      .slice(0, MORE_ROW_BATCH_SIZE)
    if (fresh.length === 0) {
      return
    }
    const ifcAPI = viewer?.IFC?.loader?.ifcManager?.ifcAPI
    const pathKey = occurrencePathKey(node.parentPath)
    Promise.all(fresh.map((geometryExpressId) =>
      labelForGeometryId(ifcAPI, 0, geometryExpressId)
        .then((label) => ({expressID: geometryExpressId, label})),
    )).then((rows) => addTransientTreeNodes(pathKey, rows))
  }

  const hasChildren = node.hasChildren
  // Assembly rows highlight like leaves — a selected assembly (NavTree click,
  // scene pick, permalink) must mark its own row, not just its descendants
  // (an old `!hasChildren` guard here left assembly selections invisible in
  // the tree). Only the types tree's group rows stay unhighlighted: they have
  // no expressID (the guard below), and their member elements highlight
  // individually.
  let isSelected = false
  // STEP: match on the occurrence path when one is selected — it's the only
  // key shared with the geometry side (a scene pick reports the part-type's
  // product_definition_shape id, which never equals this node's NAUO express
  // id), and it uniquely identifies one occurrence so a reused part lights up
  // only the clicked/picked node, not every reuse. Falls back to expressID for
  // IFC and when no occurrence is selected (selectedOccurrencePathKey is null).
  if (selectedOccurrencePathKey !== null && Array.isArray(node.occurrencePath)) {
    // A multibody part's ephemeral solid rows share the part's occurrence
    // path, so the path match alone would light up the part AND all its
    // bodies at once. The solid id splits them: a solid selection highlights
    // only its own row; a part selection only the (non-ephemeral) part row.
    const pathMatches = occurrencePathKey(node.occurrencePath) === selectedOccurrencePathKey
    isSelected = pathMatches && (selectedSolidExpressId !== null ?
      (node.ephemeral === true && node.expressID === selectedSolidExpressId) :
      node.ephemeral !== true)
  } else if (node.expressID !== undefined) {
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

  if (node.isMoreRow === true) {
    const moreIndent = 20
    return (
      <div style={{...style}}>
        <div
          data-testid='NavTreeMoreRow'
          onClick={handleMoreClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              handleMoreClick()
            }
          }}
          role='button'
          tabIndex={0}
          style={{
            paddingLeft: depth * moreIndent,
            cursor: 'pointer',
            fontStyle: 'italic',
            opacity: 0.7,
          }}
        >
          {`${node.remaining} more…`}
        </div>
      </div>
    )
  }


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
      // takes the O(1) exact path, an assembly needs the descendant scan. The
      // ephemeral flag marks a multibody solid node, whose own express id then
      // narrows the scene highlight to the one clicked body.
      selectWithShiftClickEvents(
        event.shiftKey, node.expressID.toString(), node.occurrencePath, hasChildren,
        node.ephemeral === true)
    }
  }

  let hasHideIcon = false
  if (node.transient === true) {
    // Transient anonymous-geometry rows hide through their
    // (occurrencePath, geometry id) identity — the isolator's canBeHidden
    // list is built from the spatial tree, which never contains them.
    hasHideIcon = true
  } else if (node.expressID) {
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

// Exported for tests: exercising the flatten + ordering policy
// directly beats rendering the whole virtualized panel.
export {getVisibleNodes as __getVisibleNodesForTest}

NavTreePanel.propTypes = {
  model: PropTypes.object.isRequired,
  pathPrefix: PropTypes.string,
  selectWithShiftClickEvents: PropTypes.func.isRequired,
}

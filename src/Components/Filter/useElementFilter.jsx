import React, {useState, useCallback, useMemo, useRef} from 'react'
import {Box, Chip, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import {Filter, X} from 'lucide-react'
import useStore from '../../store/useStore'


/**
 * Extract IFC type counts and storey-to-expressId mapping from the spatial structure.
 */
function buildFilterData(rootElement) {
  const typeCounts = {}    // { 'IFCWALL': 42, ... }
  const typeToIds = {}     // { 'IFCWALL': [expressId, ...], ... }
  const storeyToIds = {}   // { 'EG': [expressId, ...], ... }
  const storeyNames = []   // ['EG', 'OG1', ...]

  if (!rootElement) return {typeCounts, typeToIds, storeyToIds, storeyNames}

  let currentStorey = null

  const walk = (node) => {
    const type = node.type || ''

    if (type === 'IFCBUILDINGSTOREY') {
      const name = node.Name?.value || node.Name || `Storey #${node.expressID}`
      currentStorey = name
      if (!storeyToIds[name]) {
        storeyToIds[name] = []
        storeyNames.push(name)
      }
    }

    // Count leaf-ish types (skip structural containers)
    const skipTypes = new Set([
      'IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY',
      'IFCRELCONTAINEDINSPATIALSTRUCTURE', 'IFCRELAGGREGATES',
      '', undefined,
    ])

    if (!skipTypes.has(type) && node.expressID !== undefined) {
      if (!typeCounts[type]) {
        typeCounts[type] = 0
        typeToIds[type] = []
      }
      typeCounts[type]++
      typeToIds[type].push(node.expressID)

      if (currentStorey && storeyToIds[currentStorey]) {
        storeyToIds[currentStorey].push(node.expressID)
      }
    }

    if (node.children) {
      const prevStorey = currentStorey
      node.children.forEach(walk)
      // Restore storey context when backtracking
      if (type !== 'IFCBUILDINGSTOREY') {
        currentStorey = prevStorey
      }
    }
  }

  walk(rootElement)
  return {typeCounts, typeToIds, storeyToIds, storeyNames}
}


/**
 * Clean IFC type name for display: IFCWALL → Wall, IFCWINDOW → Window
 */
function cleanType(type) {
  return type
    .replace(/^IFC/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}


/**
 * Hook that provides filter button + sub-bar for the ViewerToolbar.
 *
 * @param {object} barSx - Styles for the sub-bar container
 * @return {{ button: ReactElement, subBar: ReactElement|null }}
 */
export default function useElementFilter(barSx) {
  const viewer = useStore((state) => state.viewer)
  const rootElement = useStore((state) => state.rootElement)
  const [showFilter, setShowFilter] = useState(false)
  const [hiddenTypes, setHiddenTypes] = useState(new Set())
  const [hiddenStoreys, setHiddenStoreys] = useState(new Set())
  const lastHiddenRef = useRef(new Set())

  const filterData = useMemo(() => buildFilterData(rootElement), [rootElement])

  const activeFilterCount = hiddenTypes.size + hiddenStoreys.size

  // Compute which expressIds should be hidden and apply
  const applyFilter = useCallback((newHiddenTypes, newHiddenStoreys) => {
    if (!viewer?.isolator) return

    const idsToHide = new Set()

    // Collect ids for hidden types
    for (const type of newHiddenTypes) {
      const ids = filterData.typeToIds[type]
      if (ids) ids.forEach((id) => idsToHide.add(id))
    }

    // Collect ids for hidden storeys
    for (const storey of newHiddenStoreys) {
      const ids = filterData.storeyToIds[storey]
      if (ids) ids.forEach((id) => idsToHide.add(id))
    }

    // Reset and re-apply
    if (lastHiddenRef.current.size > 0 || idsToHide.size > 0) {
      viewer.isolator.unHideAllElements()
      if (idsToHide.size > 0) {
        viewer.isolator.hideElementsById([...idsToHide])
      }
      lastHiddenRef.current = idsToHide
    }
  }, [viewer, filterData])

  const toggleType = useCallback((type) => {
    const next = new Set(hiddenTypes)
    if (next.has(type)) {
      next.delete(type)
    } else {
      next.add(type)
    }
    setHiddenTypes(next)
    applyFilter(next, hiddenStoreys)
  }, [hiddenTypes, hiddenStoreys, applyFilter])

  const toggleStorey = useCallback((storey) => {
    const next = new Set(hiddenStoreys)
    if (next.has(storey)) {
      next.delete(storey)
    } else {
      next.add(storey)
    }
    setHiddenStoreys(next)
    applyFilter(hiddenTypes, next)
  }, [hiddenTypes, hiddenStoreys, applyFilter])

  const showAllTypes = useCallback(() => {
    setHiddenTypes(new Set())
    applyFilter(new Set(), hiddenStoreys)
  }, [hiddenStoreys, applyFilter])

  const hideAllTypes = useCallback(() => {
    const all = new Set(Object.keys(filterData.typeCounts))
    setHiddenTypes(all)
    applyFilter(all, hiddenStoreys)
  }, [filterData, hiddenStoreys, applyFilter])

  const showAllStoreys = useCallback(() => {
    setHiddenStoreys(new Set())
    applyFilter(hiddenTypes, new Set())
  }, [hiddenTypes, applyFilter])

  const resetAll = useCallback(() => {
    setHiddenTypes(new Set())
    setHiddenStoreys(new Set())
    applyFilter(new Set(), new Set())
  }, [applyFilter])

  // Sort types by count descending
  const sortedTypes = useMemo(() =>
    Object.entries(filterData.typeCounts)
      .sort((a, b) => b[1] - a[1]),
  [filterData])

  const button = (
    <Tooltip title='Filter elements' placement='bottom'>
      <IconButton
        size='small'
        onClick={() => setShowFilter(!showFilter)}
        sx={{
          width: 30,
          height: 30,
          borderRadius: '6px',
          color: activeFilterCount > 0 ? 'var(--color-primary)' : 'var(--color-text)',
          opacity: activeFilterCount > 0 ? 1 : 0.6,
          '&:hover': {opacity: 1},
          position: 'relative',
        }}
      >
        <Filter size={15} strokeWidth={1.75}/>
        {activeFilterCount > 0 && (
          <Box sx={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: 'var(--color-primary)',
          }}/>
        )}
      </IconButton>
    </Tooltip>
  )

  const subBar = showFilter && rootElement ? (
    <Box sx={{
      ...barSx,
      pointerEvents: 'auto',
      maxWidth: 500,
      maxHeight: 200,
      overflowY: 'auto',
    }}>
      {/* Type filter */}
      <Stack direction='row' alignItems='center' sx={{mb: 0.5, gap: '4px', flexWrap: 'wrap'}}>
        <Typography sx={{fontSize: '11px', opacity: 0.4, mr: 0.5, flexShrink: 0}}>Type</Typography>
        <Typography
          onClick={showAllTypes}
          sx={{fontSize: '11px', opacity: 0.4, cursor: 'pointer', flexShrink: 0, '&:hover': {opacity: 1}}}
        >All</Typography>
        <Typography
          onClick={hideAllTypes}
          sx={{fontSize: '11px', opacity: 0.4, cursor: 'pointer', flexShrink: 0, '&:hover': {opacity: 1}}}
        >None</Typography>
        {sortedTypes.map(([type, count]) => {
          const visible = !hiddenTypes.has(type)
          return (
            <Chip
              key={type}
              label={`${cleanType(type)} (${count})`}
              size='small'
              onClick={() => toggleType(type)}
              sx={{
                height: 22,
                fontSize: '11px',
                backgroundColor: visible ? 'var(--color-selected)' : 'transparent',
                color: visible ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                borderColor: visible ? 'var(--color-primary)' : 'var(--color-border)',
                opacity: visible ? 1 : 0.5,
                '&:hover': {opacity: 1},
              }}
              variant='outlined'
            />
          )
        })}
      </Stack>

      {/* Storey filter */}
      {filterData.storeyNames.length > 0 && (
        <Stack direction='row' alignItems='center' sx={{gap: '4px', flexWrap: 'wrap'}}>
          <Typography sx={{fontSize: '11px', opacity: 0.4, mr: 0.5, flexShrink: 0}}>Storey</Typography>
          <Typography
            onClick={showAllStoreys}
            sx={{fontSize: '11px', opacity: 0.4, cursor: 'pointer', flexShrink: 0, '&:hover': {opacity: 1}}}
          >All</Typography>
          {filterData.storeyNames.map((storey) => {
            const visible = !hiddenStoreys.has(storey)
            return (
              <Chip
                key={storey}
                label={storey}
                size='small'
                onClick={() => toggleStorey(storey)}
                sx={{
                  height: 22,
                  fontSize: '11px',
                  backgroundColor: visible ? 'var(--color-selected)' : 'transparent',
                  color: visible ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  borderColor: visible ? 'var(--color-primary)' : 'var(--color-border)',
                  opacity: visible ? 1 : 0.5,
                  '&:hover': {opacity: 1},
                }}
                variant='outlined'
              />
            )
          })}
        </Stack>
      )}

      {/* Reset */}
      {activeFilterCount > 0 && (
        <Typography
          onClick={resetAll}
          sx={{fontSize: '11px', opacity: 0.4, cursor: 'pointer', mt: 0.5, '&:hover': {opacity: 1, color: '#f44336'}}}
        >
          Reset filters
        </Typography>
      )}
    </Box>
  ) : null

  return {button, subBar}
}

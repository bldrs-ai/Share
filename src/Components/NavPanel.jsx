import React from 'react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import TreeView from '@mui/lab/TreeView'
import NavTree from './NavTree'
import TypesNavTree from './TypesNavTree'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import {assertDefined} from '../utils/assert'
import NodeClosedIcon from '../assets/icons/NodeClosed.svg'
import NodeOpenIcon from '../assets/icons/NodeOpened.svg'
import TreeIcon from '../assets/icons/Tree.svg'
import ListIcon from '../assets/icons/List.svg'


/**
 * @param {object} model
 * @param {object} element
 * @param {Array} selectedElements
 * @param {Array} defaultExpandedElements
 * @param {Array} expandedElements
 * @param {Function} setExpandedElements
 * @param {string} pathPrefix
 * @return {object}
 */
export default function NavPanel({
  model,
  element,
  defaultExpandedElements,
  defaultExpandedTypes,
  expandedElements,
  setExpandedElements,
  expandedTypes,
  setExpandedTypes,
  navigationMode,
  setNavigationMode,
  selectWithShiftClickEvents,
  pathPrefix,
}) {
  assertDefined(...arguments)
  const selectedElements = useStore((state) => state.selectedElements)
  // TODO(pablo): the defaultExpanded array can contain bogus IDs with
  // no error.  Not sure of a better way to pre-open the first few
  // nodes besides hardcoding.

  const elementTypesMap = useStore((state) => state.elementTypesMap)

  const isNavTree = navigationMode === 'spatial-tree'
  return (
    <div style={{
      width: '100%',
    }}
    >
      <Paper
        elevation={0}
        variant='control'
        sx={{
          'justifyContent': 'space-around',
          'opacity': .8,
          'alignItems': 'center',
          'overflow': 'auto',
          'marginTop': '14px',
          'maxHeight': '400px',
          '@media (max-width: 900px)': {
            maxHeight: '150px',
            top: '86px',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'flex-start',
          }}
        >
          <Box
            sx={{
              padding: '4px',
            }}
          >
            <TooltipIconButton
              title={isNavTree ? 'Change to Element Type Navigation' : 'Change to Spatial Type Navigation' }
              onClick={
                isNavTree ?
                () => setNavigationMode('element-type') :
                () => setNavigationMode('spatial-tree')
              }
              icon={isNavTree ? <TreeIcon/> : <ListIcon/>}
              placement={'right'}
              dataTestId='open-ifc'
            />
          </Box>
          <TreeView
            aria-label={isNavTree ? 'IFC Navigator' : 'IFC Types Navigator'}
            defaultCollapseIcon={<NodeOpenIcon className='caretToggle'/>}
            defaultExpandIcon={<NodeClosedIcon className='caretToggle'/>}
            defaultExpanded={isNavTree ? defaultExpandedElements : defaultExpandedTypes}
            expanded={isNavTree ? expandedElements : expandedTypes}
            selected={selectedElements}
            onNodeToggle={(event, nodeIds) => {
              if (isNavTree) {
                setExpandedElements(nodeIds)
              } else {
                setExpandedTypes(nodeIds)
              }
            }}
            key='tree'
            sx={{
              'padding': '14px 0',
              'overflowY': 'auto',
              'overflowX': 'hidden',
              'flexGrow': 1,
              '&:focus svg, &:hover svg': {
                visibility: 'visible !important',
              },
            }}
          >
            {isNavTree ?
            <NavTree
              model={model}
              selectWithShiftClickEvents={selectWithShiftClickEvents}
              element={element}
              pathPrefix={pathPrefix}
            /> :
            <TypesNavTree
              model={model}
              types={elementTypesMap}
              selectWithShiftClickEvents={selectWithShiftClickEvents}
              pathPrefix={pathPrefix}
            />}
          </TreeView>
        </Box>
      </Paper>
    </div>
  )
}

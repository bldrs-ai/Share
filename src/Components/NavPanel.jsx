import React from 'react'
import Paper from '@mui/material/Paper'
import TreeView from '@mui/lab/TreeView'
import NavTree from './NavTree'
import useStore from '../store/useStore'
import {assertDefined} from '../utils/assert'
import NodeClosedIcon from '../assets/icons/NodeClosed.svg'
import NodeOpenIcon from '../assets/icons/NodeOpened.svg'


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
  expandedElements,
  setExpandedElements,
  selectWithShiftClickEvents,
  pathPrefix,
}) {
  assertDefined(...arguments)
  const selectedElements = useStore((state) => state.selectedElements)
  // TODO(pablo): the defaultExpanded array can contain bogus IDs with
  // no error.  Not sure of a better way to pre-open the first few
  // nodes besides hardcoding.


  return (
    <Paper
      elevation={0}
      variant='control'
      sx={{
        'marginTop': '14px',
        'overflow': 'auto',
        'width': '100%',
        'opacity': .8,
        'justifyContent': 'space-around',
        'alignItems': 'center',
        'maxHeight': '400px',
        '@media (max-width: 900px)': {
          maxHeight: '150px',
          top: '86px',
        },
      }}
    >
      <TreeView
        aria-label='IFC Navigator'
        defaultCollapseIcon={<NodeOpenIcon className='caretToggle'/>}
        defaultExpandIcon={<NodeClosedIcon className='caretToggle'/>}
        defaultExpanded={defaultExpandedElements}
        expanded={expandedElements}
        selected={selectedElements}
        onNodeToggle={(event, nodeIds) => {
          setExpandedElements(nodeIds)
        }}
        key='tree'
        sx={{
          'padding': '14px 0',
          'maxWidth': '400px',
          'overflowY': 'auto',
          'overflowX': 'hidden',
          'flexGrow': 1,
          '&:focus svg, &:hover svg': {
            visibility: 'visible !important',
          },
        }}
      >
        <NavTree
          model={model}
          selectWithShiftClickEvents={selectWithShiftClickEvents}
          element={element}
          pathPrefix={pathPrefix}
        />
      </TreeView>
    </Paper>
  )
}

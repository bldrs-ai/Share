import React from 'react'
import Paper from '@mui/material/Paper'
import TreeView from '@mui/lab/TreeView'
import NavTree from './NavTree'
import TypesNavTree from './TypesNavTree'
import useStore from '../store/useStore'
import {assertDefined} from '../utils/assert'
import NodeClosedIcon from '../assets/icons/NodeClosed.svg'
import NodeOpenIcon from '../assets/icons/NodeOpened.svg'
import {useExistInFeature} from '../hooks/useExistInFeature'
import NavigationGroup from './NavigationGroup'

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
  selectWithShiftClickEvents,
  pathPrefix,
}) {
  assertDefined(...arguments)
  const selectedElements = useStore((state) => state.selectedElements)
  // TODO(pablo): the defaultExpanded array can contain bogus IDs with
  // no error.  Not sure of a better way to pre-open the first few
  // nodes besides hardcoding.

  const elementTypesMap = useStore((state) => state.elementTypesMap)
  const isElementNavigation = useStore((state) => state.isElementNavigation)

  const existNavTypesInFeature = useExistInFeature('navtypes')

  const isNavTree = isElementNavigation
  return (
    <div style={{
      width: '100%',
    }}
    >
      <Paper
        elevation={0}
        aria-label='Navigation Panel'
        variant='control'
        sx={{
          'marginBottom': '10px',
          'overflow': 'auto',
          'width': '100%',
          'opacity': .8,
          'justifyContent': 'space-around',
          'alignItems': 'center',
          'maxHeight': '336px',
          '&:hover #togglegrp': {
            visibility: 'visible !important',
          },
          '&:hover svg': {
            visibility: 'visible !important',
          },
          '@media (max-width: 900px)': {
            maxHeight: '150px',
            top: '86px',
          },
          '&::-webkit-scrollbar': {
            width: '.1em',
          },
        }}
      >
        <NavigationGroup/>
        <div>
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
              'padding': existNavTypesInFeature ? '7px 0 14px 0' : '14px 0',
              'maxWidth': '400px',
              'overflowY': 'auto',
              'overflowX': 'hidden',
              'flexGrow': 1,
              '&:focus svg': {
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
        </div>
      </Paper>
    </div>
  )
}

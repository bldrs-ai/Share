import React from 'react'
import Paper from '@mui/material/Paper'
import TreeView from '@mui/lab/TreeView'
import NavTree from './NavTree'
import TypesNavTree from './TypesNavTree'
import useStore from '../store/useStore'
import {assertDefined} from '../utils/assert'
import NodeClosedIcon from '../assets/icons/NodeClosed.svg'
import NodeOpenIcon from '../assets/icons/NodeOpened.svg'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import ListIcon from '@mui/icons-material/List'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import {styled} from '@mui/material/styles'

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

  const onTreeViewChanged = (event, value) => {
    if (value !== null) {
      setNavigationMode(value)
    }
  }

  const StyledToggleButtonGroup = styled(ToggleButtonGroup)(({theme}) => ({
    '& .MuiToggleButtonGroup-grouped': {
      // eslint-disable-next-line no-magic-numbers
      'margin': theme.spacing(0.5),
      'border': 0,
      '&.Mui-disabled': {
        border: 0,
      },
      '&:not(:first-of-type)': {
        borderRadius: theme.shape.borderRadius,
      },
      '&:first-of-type': {
        borderRadius: theme.shape.borderRadius,
      },
    },
  }))

  const isNavTree = navigationMode === 'spatial-tree'
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
          'marginTop': '14px',
          'overflow': 'auto',
          'width': '100%',
          'opacity': .8,
          'justifyContent': 'space-around',
          'alignItems': 'center',
          'maxHeight': '400px',
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
        }}
      >
        <div>
          <StyledToggleButtonGroup
            exclusive
            id={'togglegrp'}
            value={navigationMode}
            size="small"
            sx={{
              'marginLeft': '16px',
              'marginTop': '8px',
              'visibility': 'hidden',
              '& button': {
                height: '30px',
                width: '30px',
              },
              '& svg': {
                height: '20px',
                width: '20px',
              },
            }}
            onChange={onTreeViewChanged}
          >
            <ToggleButton value='spatial-tree' aria-label='spatial-tree'>
              <Tooltip
                title={'Spatial Structure'}
                describeChild
                placement={'bottom-end'}
                PopperProps={{style: {zIndex: 0}}}
              >
                <AccountTreeIcon/>
              </Tooltip>
            </ToggleButton>
            <ToggleButton value='element-types' aria-label='element-types'>
              <Tooltip
                title={'Element Types'}
                describeChild
                placement={'bottom-end'}
                PopperProps={{style: {zIndex: 0}}}
              >
                <ListIcon/>
              </Tooltip>
            </ToggleButton>
          </StyledToggleButtonGroup>
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
              'padding': '7px 0 14px 0',
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

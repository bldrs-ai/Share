import React, {useState} from 'react'
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

  const [viewType, setViewType] = useState('spatial-tree')
  const elementTypesMap = useStore((state) => state.elementTypesMap)

  const onTreeViewChanged = (event, value) => {
    if (value !== null) {
      setViewType(value)
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

  return (
    <div style={{
      width: '100%',
    }}
    >
      <Paper
        elevation={0}
        variant='control'
        sx={{
          marginTop: '14px',
          display: 'flex',
          opacity: .8,
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <span style={{
          flex: 'auto',
          marginLeft: '14px',
        }}
        >Navigation
        </span>
        <StyledToggleButtonGroup
          exclusive
          value={viewType}
          size="small"
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
      </Paper>
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
            padding: '14px 0',
            maxWidth: '400px',
            overflowY: 'auto',
            overflowX: 'hidden',
            flexGrow: 1,
          }}
        >
          {viewType === 'spatial-tree' ?
          <NavTree model={model} selectWithShiftClickEvents={selectWithShiftClickEvents} element={element} pathPrefix={pathPrefix}/> :
          <TypesNavTree
            model={model}
            types={elementTypesMap}
            selectWithShiftClickEvents={selectWithShiftClickEvents} pathPrefix={pathPrefix}
          />}
        </TreeView>
      </Paper>
    </div>
  )
}

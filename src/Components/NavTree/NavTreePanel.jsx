import React, {ReactElement, useEffect, useState} from 'react'
import TreeView from '@mui/lab/TreeView'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import {styled} from '@mui/material/styles'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import Panel from '../SideDrawer/Panel'
import NavTree from './NavTree'
import TypesNavTree from './TypesNavTree'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import ListIcon from '@mui/icons-material/List'
import NodeClosedIcon from '../../assets/icons/NodeClosed.svg'
import NodeOpenIcon from '../../assets/icons/NodeOpened.svg'


/**
 * @property {object} model The model for navigation
 * @property {string} pathPrefix URL prefix for constructing links to
 *   elements, recursively grown as passed down the tree
 * @property {Function} selectWithShiftClickEvents Handler for shift-click select
 * @return {ReactElement}
 */
export default function NavTreePanel({
  model,
  pathPrefix,
  selectWithShiftClickEvents,
}) {
  assertDefined(...arguments)
  const defaultExpandedElements = useStore((state) => state.defaultExpandedElements)
  const defaultExpandedTypes = useStore((state) => state.defaultExpandedTypes)
  const elementTypesMap = useStore((state) => state.elementTypesMap)
  const expandedElements = useStore((state) => state.expandedElements)
  const expandedTypes = useStore((state) => state.expandedTypes)

  const setIsNavTreeVisible = useStore((state) => state.setIsNavTreeVisible)

  const rootElement = useStore((state) => state.rootElement)
  const selectedElements = useStore((state) => state.selectedElements)
  const setExpandedElements = useStore((state) => state.setExpandedElements)
  const setExpandedTypes = useStore((state) => state.setExpandedTypes)

  const [navigationMode, setNavigationMode] = useState('spatial-tree')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const idToRef = {}

  const isNavTree = navigationMode === 'spatial-tree'

  // TODO(pablo): major perf hit?
  useEffect(() => {
    const nodeId = selectedElements[0]
    if (nodeId) {
      const ref = idToRef[nodeId]
      if (typeof ref?.current?.scrollIntoView === 'function') {
        ref?.current?.scrollIntoView({
          block: 'center',
        })
      }
    }
  }, [selectedElements, idToRef])


  return (
    <Panel
      title='Navigation'
      actions={
        <Actions
          navigationMode={navigationMode}
          setNavigationMode={setNavigationMode}
        />}
      onClose={() => setIsNavTreeVisible(false)}
      data-testid='NavTreePanel'
    >
      <TreeView
        aria-label={isNavTree ? 'IFC Navigator' : 'IFC Types Navigator'}
        defaultCollapseIcon={<NodeOpenIcon className='icon-share icon-nav-caret'/>}
        defaultExpandIcon={<NodeClosedIcon className='icon-share icon-nav-caret'/>}
        defaultExpanded={isNavTree ? defaultExpandedElements : defaultExpandedTypes}
        expanded={isNavTree ? expandedElements : expandedTypes}
        selected={selectedElements}
        multiSelect={true}
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
          'overflowY': 'scroll',
          'overflowX': 'hidden',
          'flexGrow': 1,
          '&:focus svg': {
            visibility: 'visible !important',
          },
        }}
      >
        {
          isNavTree ?
            <NavTree
              keyId='nav-tree-root'
              model={model}
              element={rootElement}
              pathPrefix={pathPrefix}
              selectWithShiftClickEvents={selectWithShiftClickEvents}
              idToRef={idToRef}
            /> :
          <TypesNavTree
            keyId='types-nav-tree-root'
            model={model}
            types={elementTypesMap}
            pathPrefix={pathPrefix}
            selectWithShiftClickEvents={selectWithShiftClickEvents}
            idToRef={idToRef}
          />
        }
      </TreeView>
    </Panel>
  )
}


/** @return {ReactElement} */
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


  /** Hide panel and remove hash state */
/*  function onCloseClick() {
    setIsNotesVisible(false)
    removeParams(HASH_PREFIX_NOTES)
  }*/


  return (
    <StyledToggleButtonGroup
      value={navigationMode}
      onChange={(event, value) => setNavigationMode(value)}
      exclusive
      size='small'
    >
      <ToggleButton value='spatial-tree' aria-label='spatial-tree' size='small'>
        <Tooltip title='Spatial Structure' placement='top' describeChild>
          <AccountTreeIcon className='icon-share'/>
        </Tooltip>
      </ToggleButton>
      <ToggleButton value='element-types' aria-label='element-types' size='small'>
        <Tooltip title='Element Types' placement='top' describeChild>
          <ListIcon className='icon-share'/>
        </Tooltip>
      </ToggleButton>
    </StyledToggleButtonGroup>
  )
}

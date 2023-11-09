import React from 'react'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ListIcon from '@mui/icons-material/List'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import TreeView from '@mui/lab/TreeView'
import {styled} from '@mui/material/styles'
import NavTree from './NavTree'
import TypesNavTree from './TypesNavTree'
import useStore from '../store/useStore'
import {assertDefined} from '../utils/assert'
import {useExistInFeature} from '../hooks/useExistInFeature'
import NodeClosedIcon from '../assets/icons/NodeClosed.svg'
import NodeOpenIcon from '../assets/icons/NodeOpened.svg'
import CloseIcon from '@mui/icons-material/Close'


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
  const elementTypesMap = useStore((state) => state.elementTypesMap)
  const toggleIsNavigationVisible = useStore((state) => state.toggleIsNavigationVisible)
  const existNavTypesInFeature = useExistInFeature('navtypes')

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

  const isNavTree = existNavTypesInFeature ? navigationMode === 'spatial-tree' : true

  return (
    <div style={{width: '100%'}}>
      <Paper
        elevation={1}
        aria-label='Navigation Panel'
        variant='control'
        sx={{
          'marginTop': '14px',
          'overflow': 'auto',
          'width': '100%',
          'opacity': 0.8,
          'justifyContent': 'space-around',
          'alignItems': 'center',
          'maxHeight': '300px',
          '@media (max-width: 900px)': {
            maxHeight: '300PX',
            top: '86px',
          },
        }}
      >
        <Stack direction='column'>
          {/* Sticky Header */}
          <Stack
            direction='row'
            justifyContent='space-between'
            alignItems='center'
            sx={{
              position: 'sticky',
              top: 0,
              backgroundColor: 'background.paper',
              zIndex: 1,
            }}
          >
            <Typography variant='overline' sx={{marginLeft: '1em'}}>Navigation</Typography>
            <Box sx={{marginRight: '.4em'}}>
              <IconButton aria-label="close" size="small" onClick={toggleIsNavigationVisible}>
                <CloseIcon fontSize="inherit"/>
              </IconButton>
            </Box>
          </Stack>

          {/* Content */}
          <Box>
            {existNavTypesInFeature && (
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
            )}
            <TreeView
              aria-label={isNavTree ? 'IFC Navigator' : 'IFC Types Navigator'}
              defaultCollapseIcon={<NodeOpenIcon className='icon-share icon-nav-caret'/>}
              defaultExpandIcon={<NodeClosedIcon className='icon-share icon-nav-caret'/>}
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
                'padding': existNavTypesInFeature ? '7px 0 14px 0' : '4px 0px 10px 0px',
                'maxWidth': '400px',
                'overflowY': 'auto',
                'overflowX': 'hidden',
                'flexGrow': 1,
                '&:focus svg': {
                  visibility: 'visible !important',
                },
              }}
            >
              {isNavTree ? (
                <NavTree
                  model={model}
                  selectWithShiftClickEvents={selectWithShiftClickEvents}
                  element={element}
                  pathPrefix={pathPrefix}
                />
              ) : (
                <TypesNavTree
                  model={model}
                  types={elementTypesMap}
                  selectWithShiftClickEvents={selectWithShiftClickEvents}
                  pathPrefix={pathPrefix}
                />
              )}
            </TreeView>
          </Box>
        </Stack>
      </Paper>
    </div>
  )
}

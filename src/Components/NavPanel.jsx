import React from 'react'
import Paper from '@mui/material/Paper'
import TreeView from '@mui/lab/TreeView'
import {makeStyles} from '@mui/styles'
import NavTree from './NavTree'
import {assertDefined} from '../utils/assert'
import NodeClosed from '../assets/2D_Icons/NodeClosed.svg'
import NodeOpen from '../assets/2D_Icons/NodeOpened.svg'
import useStore from '../store/useStore'


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
  pathPrefix,
}) {
  assertDefined(...arguments)
  const classes = useStyles()
  const selectedElements = useStore((state) => state.selectedElements)
  // TODO(pablo): the defaultExpanded array can contain bogus IDs with
  // no error.  Not sure of a better way to pre-open the first few
  // nodes besides hardcoding.
  return (
    <Paper className={classes.root} >
      <div className={classes.treeContainer}>
        <TreeView
          aria-label='IFC Navigator'
          defaultCollapseIcon={<NodeOpen className={classes.icon} />}
          defaultExpandIcon={<NodeClosed className={classes.icon} />}
          sx={{flexGrow: 1, maxWidth: 400, overflowY: 'auto', overflowX: 'hidden'}}
          defaultExpanded={defaultExpandedElements}
          expanded={expandedElements}
          selected={selectedElements}
          onNodeToggle={(event, nodeIds) => {
            setExpandedElements(nodeIds)
          }}
          key='tree'
        >
          {
            <NavTree
              model={model}
              element={element}
              pathPrefix={pathPrefix}
            />
          }
        </TreeView>
      </div>
    </Paper>
  )
}


const useStyles = makeStyles({
  root: {
    'position': 'absolute',
    'top': '94px',
    'left': '20px',
    'overflow': 'auto',
    'width': '300px',
    'justifyContent': 'space-around',
    'alignItems': 'center',
    'maxHeight': '50%',
    '@media (max-width: 900px)': {
      maxHeight: '30%',
      width: '250px',
      top: '80px',
    },
  },
  treeContainer: {
    paddingTop: '14px',
    paddingBottom: '14px',
    overflow: 'auto',
  },
  paper: {
    display: 'flex',
    overflow: 'auto',
    flexDirection: 'column',
    width: '220px',
  },
  treeIcon: {
    width: '30px',
    height: '30px',
  },
  icon: {
    width: '12px',
    height: '12px',
  },
  toggleButton: {
    'position': 'absolute',
    'top': (props) => `${props.topOffset}px`,
    'left': '30px',
    '@media (max-width: 900px)': {
      left: '20px',
    },
  },
})

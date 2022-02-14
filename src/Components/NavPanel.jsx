import React, {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import Paper from '@mui/material/Paper'
import TreeView from '@mui/lab/TreeView'
import {makeStyles} from '@mui/styles'
import NavTree from './NavTree'
import NodeClosed from '../assets/3D/nodeClosed.svg'
import NodeOpen from '../assets/3D/nodeOpen.svg'


/**
 * @param {Object} viewer
 * @param {Object} element
 * @param {Array} selectedElements
 * @param {Array} defaultExpandedElements
 * @param {Array} expandedElements
 * @param {function} onElementSelect
 * @param {function} setExpandedElements
 * @param {string} pathPrefix
 * @return {Object}
 */
export default function NavPanel({
  viewer,
  element,
  selectedElements,
  defaultExpandedElements,
  expandedElements,
  onElementSelect,
  setExpandedElements,
  pathPrefix,
}) {
  const location = useLocation()

  useEffect(() => {
    if (location.pathname.length <= 0) {
      return
    }
    const parts = location.pathname.split(/\//)
    if (parts.length > 0) {
      const targetId = parseInt(parts[parts.length - 1])
      if (isFinite(targetId)) {
        onElementSelect({expressID: targetId})
        setExpandedElements(parts)
      }
    }
  /* eslint-disable */
  }, [location])

  const classes = useStyles()
  // TODO(pablo): the defaultExpanded array can contain bogus IDs with
  // no error.  Not sure of a better way to pre-open the first few
  // nodes besides hardcoding.
  return (
    <Paper className={classes.contextualMenu}>
      <div className={classes.treeContainer}>
        <TreeView
          aria-label='IFC Navigator'
          defaultCollapseIcon={<NodeOpen className = {classes.icon} />}
          defaultExpandIcon={<NodeClosed className = {classes.icon} />}
          sx={{flexGrow: 1, maxWidth: 400, overflowY: 'auto'}}
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
              viewer={viewer}
              element={element}
              pathPrefix={pathPrefix}
              onElementSelect={onElementSelect}
              setExpandedElements={setExpandedElements}
            />
          }
        </TreeView>
      </div>
    </Paper>
  )
}


const useStyles = makeStyles({
  contextualMenu: {
    'position': 'absolute',
    'top': '144px',
    'left': '23px',
    'overflow': 'auto',
    'width': '308px',
    'justifyContent': 'space-around',
    'alignItems': 'center',
    'maxHeight': '50%',
    '@media (max-width: 900px)': {
      maxHeight: '30%',
      width: '250px',
    },
  },
  treeContainer: {
    paddingTop: '14px',
    paddingBottom: '14px',
    overflow: 'scroll',
  },
  paper: {
    display: 'flex',
    overflow: 'auto',
    flexDirection: 'column',
    width: '220px',
    backgroundColor: 'lightGray',
  },
  icon: {
    width: 12,
    height: 12,
  },
})

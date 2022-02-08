import React from 'react';
import { useLocation } from 'react-router-dom';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import TreeView from '@mui/lab/TreeView';
import NavTree from './NavTree';
import NodeClosed from '../assets/NodeClosed.svg';
import NodeOpen from '../assets/NodeOpen.svg';


const useStyles = makeStyles({
  contextualMenu: {
    position: 'absolute',
    top: "144px",
    left: "20px",
    overflow: 'auto',
    width: '308px',
    justifyContent: 'space-around',
    alignItems: 'center',
    maxHeight: '50%',
    '@media (max-width: 900px)': {
      maxHeight: '30%',
      width: '250px',
    },
  },
  treeContainer:{
    paddingTop: '20px',
    paddingBottom: '20px',
    paddingLeft:'5px',
    overflow: 'scroll',
  },
  paper: {
    display: 'flex',
    overflow: 'auto',
    flexDirection: 'column',
    width: '220px',
    backgroundColor: 'lightGray',
  },
  icon:{
    width: 14,
    height: 14
  }
});


const NavPanel = ({
  viewer,
  element,
  selectedElements,
  defaultExpandedElements,
  expandedElements,
  onElementSelect,
  setExpandedElements,
  pathPrefix
}) => {
  const location = useLocation();

  function id(elt) {
    return elt.expressID.toString();
  }

  React.useEffect(() => {
    if (location.pathname.length <= 0) {
      return;
    }
    const parts = location.pathname.split(/\//);
    if (parts.length > 0) {
      const targetId = parseInt(parts[parts.length - 1]);
      if (isFinite(targetId)) {
        onElementSelect({ expressID: targetId });
        setExpandedElements(parts);
      }
    }
  }, [location]);

  const classes = useStyles();
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
          sx={{ flexGrow: 1, maxWidth: 400, overflowY: 'auto' }}
          defaultExpanded={defaultExpandedElements}
          expanded={expandedElements}
          selected={selectedElements}
          onNodeToggle={(event, nodeIds) => {setExpandedElements(nodeIds)}}
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
  );
};

export default NavPanel;

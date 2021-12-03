import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import TreeView from '@mui/lab/TreeView';
import TreeItem, { useTreeItem } from '@mui/lab/TreeItem';
import { reifyName } from '../utils/Ifc';
import NavTree from './NavTree';
import ArrowStraight from '../assets/Arrow_straight.svg';
import ArrowDown from '../assets/Arrow_down.svg';

const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 308,
    border: 'none',
    justifyContent: 'space-around',
    alignItems: 'center',
    overflow: 'scroll',
    height: '70%',
    '@media (max-width: 900px)': {
      height: '70%',
    },
  },
  paper: {
    display: 'flex',
    overflow: 'auto',
    flexDirection: 'column',
    width: '220px',
    backgroundColor: 'lightGray',
  },
}));

const NavPanel = ({
  viewer,
  element,
  selectedElements,
  defaultExpandedElements,
  expandedElements,
  onElementSelect,
  setExpandedElements,
}) => {
  const location = useLocation();

  function id(elt) {
    return elt.expressID.toString();
  }

  React.useEffect(() => {
    let eltPath = location.pathname.split(/nav\//);
    if (eltPath.length == 1) {
      return;
    }
    eltPath = eltPath[1];
    const parts = eltPath.split(/\//);
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
    <Paper
      className={classes.contextualMenu}
      style={{
        position: 'absolute',
        top: 144,
        left: 20,
        overflow: 'auto',
      }}
      <div style={{ marginTop: 20 }}>
        <TreeView
          aria-label='IFC Navigator'
          defaultCollapseIcon={<ArrowDown style={{ width: 16, height: 16 }} />}
          defaultExpandIcon={
            <ArrowStraight style={{ width: 16, height: 16 }} />
          }
          sx={{ flexGrow: 1, maxWidth: 400, overflowY: 'auto' }}
          defaultExpanded={defaultExpandedElements}
          expanded={expandedElements}
          selected={selectedElements}
          onNodeToggle={(event, nodeIds) => {
            setExpandedElements(nodeIds);
          }}
          key='tree'
        >
          {
            <NavTree
              viewer={viewer}
              element={element}
              pathPrefix={'/Share/nav'}
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

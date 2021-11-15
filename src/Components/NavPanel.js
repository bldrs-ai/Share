import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import NavTree from './NavTree.js';


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
  expandedElements,
  onElementSelect
}) => {
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
      >
      <TreeView
        aria-label="IFC Navigator"
        defaultCollapseIcon={<ExpandMoreIcon />}
        defaultExpandIcon={<ChevronRightIcon />}
        sx={{ flexGrow: 1, maxWidth: 400, overflowY: 'auto' }}
        defaultExpanded = {expandedElements}
        selected = {selectedElements}
        key = "tree">
        <Routes>
          <Route
            path="nav/*"
            element={
              <NavTree
                viewer = {viewer}
                element = {element}
                onElementSelect = {onElementSelect}
                keyPrefix = {'root'}/>
            }/>
        </Routes>
      </TreeView>
    </Paper>
  );
};


export default NavPanel;

import { makeStyles } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';

import NavTree from './NavTree.js';


const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 308,
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    alignItems: 'center',
    overflow: 'scroll',
    marginLeft: '-5px',
    height: '70%',
    '@media (max-width: 900px)': {
      height: '50%',
    },
  },
  paper: {
    padding: theme.spacing(2),
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
  onElementSelect
}) => {
  const classes = useStyles();
  return (
    <Paper
      className={classes.contextualMenu}
      style={{
        position: 'absolute',
        top: 144,
        left: 24,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}
    >
      <NavTree
        viewer = {viewer}
        element = {element}
        onElementSelect = {onElementSelect}
        showChildren = {true}
        parentOpen = {true}
      />
    </Paper>
  );
};


export default NavPanel;

import { makeStyles } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';
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
        left: 20,
        overflow: 'auto',
      }}
      >
      <TreeView
        aria-label="IFC Navigator"
        defaultCollapseIcon={<ExpandMoreIcon />}
        defaultExpandIcon={<ChevronRightIcon />}
        sx={{ flexGrow: 1, maxWidth: 400, overflowY: 'auto' }}
        key = "tree">
        <NavTree
          viewer = {viewer}
          element = {element}
          onElementSelect = {onElementSelect}
          showChildren = {true}
          keyPrefix = {'root'}/>
      </TreeView>
    </Paper>
  );
};


export default NavPanel;

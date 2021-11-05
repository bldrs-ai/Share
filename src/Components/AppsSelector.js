import React from 'react';
import AppsList from './AppsList.js';
import AppsButton from './AppsButton.js';
import Popover from '@mui/material/Popover';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles((theme) => ({
  popover:{
    margin: theme.spacing(1)
  }
}));

const AppsSelector = () => {
  const classes = useStyles();
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  const id = open ? 'simple-popover' : undefined;

  return (
    <div>
      <AppsButton 
        aria-describedby={id}
        onClick={handleClick}
      />
      <Popover 
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}  
        className={classes.popover}
        anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
        }}
        transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
        }}
      >
          <AppsList />
      </Popover>
    </div>
  );
};

export default AppsSelector;
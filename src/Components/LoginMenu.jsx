import React from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import PkgJson from '../../package.json';
import Person from '../assets/Person.svg';
import { makeStyles } from '@mui/styles';


const useStyles = makeStyles(() => ({
  icon:{
    width: '30px',
    height: '30px',
  },
  menuItem:{
    height:'30px'
  }
}));

const LoginMenu = () => {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);
  const classes = useStyles();
  const handleClose = () => {
    setAnchorEl(null);
  };
  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };
  return (
    <div>
      <IconButton
        aria-label='account of current user'
        aria-controls='menu-appbar'
        aria-haspopup='true'
        onClick={handleMenu}
        color='inherit'
      >
        <Person className = {classes.icon}/>
      </IconButton>

      <Menu
        id='menu-appbar'
        elevation={2}
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        open={open}
        onClose={handleClose}
        style = {{height:80}}
        PaperProps={{
            style: {
              transform: 'translateX(-160px) translateY(-7px)',
            }
          }}
      >
        <MenuItem className={classes.menuItem} >Version: {PkgJson.version}</MenuItem>
      </Menu>
    </div>
  );
};

export default LoginMenu;

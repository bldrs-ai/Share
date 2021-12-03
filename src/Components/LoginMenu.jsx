import React from 'react';
import { Link } from 'react-router-dom';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import PkgJson from '../../package.json';
import Person from '../assets/Person.svg';

const LoginMenu = () => {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);
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
        <Person
          style={{
            width: '40px',
            height: '40px',
          }}
        />
      </IconButton>

      <Menu
        id='menu-appbar'
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        keepMounted
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        open={open}
        onClose={handleClose}
      >
        <MenuItem onClick={handleClose}>Version: {PkgJson.version}</MenuItem>
      </Menu>
    </div>
  );
};

export default LoginMenu;

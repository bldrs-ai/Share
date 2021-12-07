import React from 'react';
import { Link } from 'react-router-dom';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import PkgJson from '../../package.json';
import Person from '../assets/Person.svg';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles(() => ({
  MenuItem: {
    fontSize: 20,
    fontFamily:'Helvetica',
  },
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
        <Person
          style={{
            width: '40px',
            height: '40px',
          }}
        />
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
        PaperProps={{
            style: {
              transform: 'translateX(-70px) translateY(0pc)',
            }
          }}
      >
        <MenuItem style = {{fontSize: 16,fontFamily:'Helvetica' }}> <a href = {'https://github.com/buildrs/Share'}>Repository</a></MenuItem>
        <MenuItem style = {{fontSize: 10,fontFamily:'Helvetica', color:'gray' }}>Version: {PkgJson.version}</MenuItem>
      </Menu>
    </div>
  );
};

export default LoginMenu;

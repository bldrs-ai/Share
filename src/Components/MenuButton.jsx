import React from 'react';
import { makeStyles } from '@mui/styles';
import IconButton from '@mui/material/IconButton';


const useStyles = makeStyles((theme) => ({
  menuButton: {
    border: '2px solid lime',
    '@media (max-width: 1280px)': {
      border: '2px solid lime',
    },
  },
  menuButtonDisabled: {
    '@media (max-width: 1280px)': {},
  },
}));


const MenuButton = ({ onClick, disabled, open }) => {
  const classes = useStyles();
  return (
    <IconButton
      edge='start'
      className={disabled ? classes.menuButtonDisabled : classes.menuButton}
      color='secondary'
      aria-label='menu'
      onClick={onClick}
      disabled={disabled}
    >
      {open ? (
        <div>X</div>
      ) : (
        <div>O</div>
      )}
    </IconButton>
  );
};


export default MenuButton;

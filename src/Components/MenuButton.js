import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from '@material-ui/icons/Close';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';

const useStyles = makeStyles((theme) => ({
  menuButton: {
    // border: '2px solid lime',
    color: 'white',
    '@media (max-width: 1280px)': {
      // border: '2px solid lime',
      color: 'white',
    },
  },
  menuButtonDisabled: {
    color: 'white',
    '@media (max-width: 1280px)': { color: 'white' },
  },
}));

const MenuButton = ({ onClick, disabled, open }) => {
  const classes = useStyles();
  return (
    <IconButton
      edge='start'
      className={disabled ? classes.menuButtonDisabled : classes.menuButton}
      // color='primary'
      aria-label='menu'
      onClick={onClick}
      disabled={disabled}
    >
      {open ? (
        <CloseIcon
          style={{
            width: 30,
            height: 30,
          }}
        />
      ) : (
        <InfoOutlinedIcon
          style={{
            width: 30,
            height: 30,
          }}
        />
      )}
    </IconButton>
  );
};

export default MenuButton;

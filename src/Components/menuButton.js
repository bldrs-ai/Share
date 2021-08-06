import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import MenuIcon from '@material-ui/icons/Menu';
import IconButton from '@material-ui/core/IconButton';

const useStyles = makeStyles((theme) => ({
  menuButton: {
    '@media (max-width: 1280px)': {
      border: '2px solid lime',
    },
  },
}));

const MenuButton = ({ onClick }) => {
  const classes = useStyles();
  return (
    <IconButton
      edge='start'
      className={classes.menuButton}
      color='secondary'
      aria-label='menu'
      onClick={onClick}
    >
      <MenuIcon
        style={{
          width: 30,
          height: 30,
        }}
      />
    </IconButton>
  );
};

export default MenuButton;

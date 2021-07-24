import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import MenuIcon from "@material-ui/icons/Menu";
import IconButton from "@material-ui/core/IconButton";

const useStyles = makeStyles((theme) => ({
  menuButton: {
    marginLeft: 12,
    marginRight: 22,
  },
}));

const MenuButton = ({ onClick }) => {
  const classes = useStyles();
  return (
    <IconButton
      edge="start"
      className={classes.menuButton}
      color="secondary"
      aria-label="menu"
      onClick={onClick}
    >
      <MenuIcon />
    </IconButton>
  );
};

export default MenuButton;

import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import MenuIcon from "@material-ui/icons/Menu";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import InfoOutlinedIcon from "@material-ui/icons/InfoOutlined";

const useStyles = makeStyles((theme) => ({
  menuButton: {
    "@media (max-width: 1280px)": {
      border: "2px solid lime",
    },
  },
  menuButtonDisabled: {
    "@media (max-width: 1280px)": {},
  },
}));

const MenuButton = ({ onClick, disabled, open }) => {
  const classes = useStyles();
  return (
    <IconButton
      edge="start"
      className={disabled ? classes.menuButtonDisabled : classes.menuButton}
      color="secondary"
      aria-label="menu"
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

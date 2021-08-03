import React from "react";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import OpenInBrowserIcon from "@material-ui/icons/OpenInBrowser";
import CommentIcon from "@material-ui/icons/Comment";
import PrimaryButton from "../Components/primaryButton";
import LoginMenu from "./loginMenu";
import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles((theme) => ({
  title: {
    flexGrow: 1,
    color: "WhiteSmoke",
    fontSize: 20,
    marginRight: "20px",
  },
}));

const BuildrsToolBar = ({ fileOpen, onClickShare }) => {
  const classes = useStyles();
  return (
    <Toolbar
      variant="regular"
      style={{
        borderBottom: "1px solid 	#585858",
        backgroundColor: "#787878",
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "flex-start",
          alignItems: "center",
        }}
      >
        <Typography variant="h6" className={classes.title}>
          BUILDRS
        </Typography>

        <IconButton
          edge="start"
          color="secondary"
          aria-label="menu"
          style={{ position: "relative" }}
          onClick={fileOpen}
        >
          <OpenInBrowserIcon
            style={{
              width: 30,
              height: 30,
              color: "whiteSmoke",
            }}
          />
        </IconButton>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "flex-start",
          alignItems: "center",
        }}
      >
        <IconButton
          edge="start"
          color="secondary"
          aria-label="menu"
          style={{ position: "relative", right: 10 }}
        >
          <CommentIcon
            style={{
              width: 30,
              height: 30,
              color: "whiteSmoke",
            }}
          />
        </IconButton>
        <PrimaryButton name={"Share"} onClick={onClickShare} />
        <LoginMenu />
      </div>
    </Toolbar>
  );
};

export default BuildrsToolBar;

import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import {Info} from './info.js';

const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 240,
    height: 300,
    border: "none",
    marginLeft: "24px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    alignItems: "center",
  },
  paper: {
    padding: theme.spacing(2),
    display: "flex",
    overflow: "auto",
    flexDirection: "column",
    height: "50px",
    width: "160px",
  },
}));


const ElementsInfo = ({viewer, element}) => {
  const classes = useStyles();
  return (
    <div
      className={classes.contextualMenu}
      style={{
        height: 'auto',
        position: 'absolute',
        top: 130,
        right: 34,
      }}>
      <Paper
        elevation={3}
        className={classes.paper}
        style={{
          position: 'absolute',
          width: 'auto',
          height: 'auto',
          top: '0px',
          right: '0px',
          minHeight: '20%' }}>
        <Info viewer = {viewer}
              element = {element} />
      </Paper>
    </div>
  );
};

export default ElementsInfo;

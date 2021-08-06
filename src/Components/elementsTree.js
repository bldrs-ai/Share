import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import ElementsTreeStructure from "./tree.js";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Typography from "@material-ui/core/Typography";
import Box from "@material-ui/core/Box";
import { Info } from "./info";

const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 308,
    border: "none",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    alignItems: "center",
    overflow: "scroll",
    marginLeft: "-5px",
  },
  paper: {
    padding: theme.spacing(2),
    display: "flex",
    overflow: "auto",
    flexDirection: "column",
    width: "220px",
    backgroundColor: "lightGray",
  },
}));

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box p={3}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}
function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    "aria-controls": `simple-tabpanel-${index}`,
  };
}

const ElementsTree = ({
  viewer,
  ifcElement,
  onElementSelect,
  elementProps,
}) => {
  const classes = useStyles();
  console.log("element prop", elementProps);
  const [value, setValue] = React.useState(0);
  const handleChange = (event, newValue) => {
    setValue(newValue);
  };
  return (
    <Paper
      className={classes.contextualMenu}
      style={{
        position: "absolute",
        top: 144,
        left: 24,
        height: "70%",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
      }}
    >
      <Tabs
        value={value}
        onChange={handleChange}
        aria-label="simple tabs example"
      >
        <Tab label="Tree" {...a11yProps(0)} />
        <Tab label="Info" {...a11yProps(1)} />
      </Tabs>
      <TabPanel value={value} index={0}>
        <ElementsTreeStructure
          viewer={viewer}
          ifcElement={ifcElement}
          onElementSelect={onElementSelect}
          showChildren={true}
          parentOpen={true}
        />
      </TabPanel>
      <TabPanel value={value} index={1}>
        <Info elementProps={elementProps} />
      </TabPanel>
    </Paper>
  );
};

export default ElementsTree;

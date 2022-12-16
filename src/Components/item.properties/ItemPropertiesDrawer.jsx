import React from "react";
import { TooltipIconButton } from "../Buttons";
import { MOBILE_WIDTH } from "../Hooks";
import { preprocessMediaQuery } from "../../utils/mediaQuery";
import CloseIcon from "../assets/2D_Icons/Close.svg";
import { Box, Drawer } from "@mui/material";

/**
 * ItemPropertiesDrawer contains the ItemPanel and allows for
 * show/hide from the right of the screen.
 *
 * @param {string} title Title for the drawer
 * @param {object} content The contained ItemPanel
 * @param {Function} onClose Callback
 * @return {object} ItemPropertiesDrawer react component
 */
export default function ItemPropertiesDrawer({ title, content, onClose }) {
  return (
    <Drawer
      sx={preprocessMediaQuery(MOBILE_WIDTH, {
        "& > .MuiPaper-root": {
          width: "20em",
          // This lets the h1 in ItemProperties use 1em padding but have
          // its mid-line align with the text in SearchBar
          padding: "4px 1em",
          "@media (max-width: MOBILE_WIDTH)": {
            width: "auto",
            height: "250px",
          },
        },
        "& .MuiPaper-root": {
          marginTop: "0px",
          borderRadius: "0px",
          zIndex: 10,
        },
      })}
      open={true}
      anchor={"right"}
      variant="persistent"
      elevation={4}
    >
      <Box
        sx={preprocessMediaQuery(MOBILE_WIDTH, {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "1em 0",
          "@media (max-width: MOBILE_WIDTH)": {
            borderBottom: "none",
            height: "20px",
          },
        })}
      >
        <h1>{title}</h1>
        <TooltipIconButton
          title="Close properties"
          onClick={onClose}
          icon={<CloseIcon />}
        />
      </Box>
      <Box
        sx={preprocessMediaQuery(MOBILE_WIDTH, {
          overflow: "auto",
          height: "90%",
          "@media (max-width: MOBILE_WIDTH)": {
            overflow: "auto",
          },
        })}
      >
        {content}
      </Box>
    </Drawer>
  );
}

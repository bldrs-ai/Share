import React from "react";
import OpenModelControl from "./OpenModelControl";
import { Box } from "@mui/material";

/**
 * Base group contains Settings, ModelUpload, About
 *
 * @param {string} installPrefix Serving prefix for the app, for use in
 * constructing static asset links.
 * @param {object} fileOpen ItemPanel component
 * @return {object} React component
 */
export default function BaseGroup({ installPrefix, fileOpen }) {
  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      })}
    >
      <OpenModelControl installPrefix={installPrefix} fileOpen={fileOpen} />
    </Box>
  );
}

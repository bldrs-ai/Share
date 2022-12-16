import React, { useRef, useState } from "react";
import { Box, Divider, InputBase, Paper } from "@mui/material";
import { UilMinusSquare, UilSearch } from "@iconscout/react-unicons";
import { TooltipToggleButton } from "./Buttons";

/**
 * Search bar
 *
 * @param {object} startAdornment Child component at start of search bar
 * @param {Function} onSubmit
 * @return {object} The SearchBar react component
 */
export default function InputBar({ startAdornment, onSubmit }) {
  const [inputText, setInputText] = useState("");
  const onInputChange = (event) => setInputText(event.target.value);
  const searchInputRef = useRef(null);

  return (
    <Box>
      <Paper
        component="form"
        sx={{
          display: "flex",
          minWidth: "200px",
          width: "288px",
          maxWidth: "400px",
          alignItems: "center",
          padding: "2px 2px 2px 2px",
          "@media (max-width: 900px)": {
            minWidth: "300px",
            width: "300px",
            maxWidth: "300px",
          },
          "& .MuiInputBase-root": {
            flex: 1,
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "30px",
            height: "30px",
            margin: "5px",
          }}
        >
          {startAdornment}
        </Box>
        <Divider
          orientation="vertical"
          flexItem
          sx={{
            height: "36px",
            alignSelf: "center",
            margin: "0px 10px 0px 0px",
          }}
        />
        <InputBase
          inputRef={searchInputRef}
          value={inputText}
          onChange={onInputChange}
          error={true}
          placeholder={"Paste GitHub link here"}
        />
        {inputText.length > 0 ? (
          <TooltipToggleButton
            title="clear"
            size="small"
            placement="bottom"
            onClick={() => {
              setInputText("");
            }}
            icon={<UilMinusSquare />}
          />
        ) : null}
        {inputText.length > 0 ? (
          <TooltipToggleButton
            title="search"
            size="small"
            placement="bottom"
            onClick={() => onSubmit()}
            icon={<UilSearch />}
          />
        ) : null}
      </Paper>
    </Box>
  );
}

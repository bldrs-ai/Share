import React, { useEffect, useRef } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { useNavigate, useParams } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CadView from "./Containers/CadView";
import useStore from "./store/useStore";
import useTheme from "./Theme";
import debug from "./utils/debug";
import { ColorModeContext } from "./Context/ColorMode";
import "./index.css";
// TODO: This isn't used.
// If icons-material isn't imported somewhere, mui dies
/* eslint-disable */
import AccountCircle from "@mui/icons-material/AccountCircle";
/* eslint-enable */

/**
 * Handles path demuxing to pass to CadView.
 *
 * @param {string} installPrefix e.g. '' on bldrs.ai or /Share on GitHub pages.
 * @param {string} appPrefix e.g. /share is the prefix for this component.
 * @param {string} pathPrefix e.g. v/p for CadView, currently the only child.
 * @return {React.Component} The Share react component.
 */
export default function Share({ installPrefix, appPrefix, pathPrefix }) {
  const navigation = useRef(useNavigate());
  const urlParams = useParams();
  const setRepository = useStore((state) => state.setRepository);
  const modelPath = useStore((state) => state.modelPath);
  const setModelPath = useStore((state) => state.setModelPath);

  /**
   * On a change to urlParams, setting a new model path will clear the
   * scene and load the new model IFC.  If there's not a valid IFC,
   * the helper will redirect to the index file.
   *
   * Otherwise, the param change is a sub-path, e.g. the IFC element
   * path, so no other useEffect is triggered.
   */
  useEffect(() => {
    /** A demux to help forward to the index file, load a new model or do nothing. */
    const onChangeUrlParams = () => {
      const mp = getModelPath(installPrefix, pathPrefix, urlParams);
      if (mp === null) {
        navToDefault(navigation.current, appPrefix);
        return;
      }
      if (
        modelPath === null ||
        (modelPath.filepath && modelPath.filepath !== mp.filepath) ||
        (modelPath.gitpath && modelPath.gitpath !== mp.gitpath)
      ) {
        setModelPath(mp);
        debug().log("Share#onChangeUrlParams: new model path: ", mp);
      }
    };
    onChangeUrlParams();

    // TODO(pablo): currently expect these to both be defined.
    const { org, repo } = urlParams;
    if (org && repo) {
      setRepository(org, repo);
    } else if (pathPrefix.startsWith("/share/v/p")) {
      debug().log("Setting default repo pablo-mayrgundter/Share");
      setRepository("pablo-mayrgundter", "Share");
    } else {
      console.warn("No repository set for project!", pathPrefix);
    }
  }, [
    appPrefix,
    installPrefix,
    modelPath,
    pathPrefix,
    setRepository,
    urlParams,
    setModelPath,
  ]);

  const { theme, colorMode } = useTheme();

  return (
    modelPath && (
      <CssBaseline>
        <ColorModeContext.Provider value={colorMode}>
          <ThemeProvider theme={theme}>
            <CadView
              installPrefix={installPrefix}
              appPrefix={appPrefix}
              pathPrefix={pathPrefix}
              modelPath={modelPath}
            />
          </ThemeProvider>
        </ColorModeContext.Provider>
      </CssBaseline>
    )
  );
}

/**
 * Navigate to index.ifc with nice camera setting.
 *
 * @param {Function} navigate
 * @param {string} appPrefix
 */
export function navToDefault(navigate, appPrefix) {
  // TODO: probe for index.ifc
  const mediaSizeTabletWith = 900;
  if (window.innerWidth <= mediaSizeTabletWith) {
    navigate(
      `${appPrefix}/v/p/index.ifc#c:-158.5,-86,165.36,-39.36,18.57,-5.33`
    );
  } else {
    navigate(
      `${appPrefix}/v/p/index.ifc#c:-111.37,14.94,90.63,-43.48,15.73,-4.34`
    );
  }
}

/**
 * Returns a reference to an IFC model file.  For use by IfcViewerAPI.load.
 *
 * Format is either a reference within this project's serving directory:
 *   {filepath: '/file.ifc'}
 *
 * or a global GitHub path:
 *   {gitpath: 'http://host/share/v/gh/bldrs-ai/Share/main/index.ifc'}
 *
 * @param {string} installPrefix e.g. /share
 * @param {string} pathPrefix e.g. /share/v/p
 * @param {object} urlParams e.g. .../:org/:repo/:branch/*
 * @return {object}
 */
export function getModelPath(installPrefix, pathPrefix, urlParams) {
  // TODO: combine modelPath methods into class.
  let m = null;
  let filepath = urlParams["*"];
  if (filepath === "") {
    return null;
  }
  const splitRegex = /\.ifc/i;
  const match = splitRegex.exec(filepath);
  if (!match) {
    throw new Error('Filepath must contain ".ifc" (case-insensitive)');
  }
  const parts = filepath.split(splitRegex);
  filepath = `/${parts[0]}${match[0]}`;
  if (pathPrefix.endsWith("new") || pathPrefix.endsWith("/p")) {
    // * param is defined in ../Share.jsx, e.g.:
    //   /v/p/*.  It should be only the filename.
    // Filepath is a reference rooted in the serving directory.
    // e.g. /haus.ifc or /ifc-files/haus.ifc
    m = {
      filepath: filepath,
      eltPath: parts[1],
    };
    debug().log(
      "Share#getModelPath: is a project file: ",
      m,
      window.location.hash
    );
  } else if (pathPrefix.endsWith("/gh")) {
    m = {
      org: urlParams["org"],
      repo: urlParams["repo"],
      branch: urlParams["branch"],
      filepath: filepath,
      eltPath: parts[1],
    };
    m.getRepoPath = () => `/${m.org}/${m.repo}/${m.branch}${m.filepath}`;
    m.gitpath = `https://raw.githubusercontent.com${m.getRepoPath()}`;
    debug().log("Share#getModelPath: is a remote GitHub file: ", m);
  } else {
    throw new Error("Empty view type from pathPrefix");
  }
  return m;
}

import React from 'react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import {useWindowDimensions} from './Hooks'


/**
 * @param {object} modelPath
 * @return {object} React component
 */
export default function FileBreadCrumbs({modelPath, isLocalModel}) {
  const theme = useTheme()
  const windowDimensions = useWindowDimensions()
  const spacingBetweenSearchAndOpsGroupPx = 20
  const operationsGroupWidthPx = 60
  const searchAndNavWidthPx = windowDimensions.width - (operationsGroupWidthPx + spacingBetweenSearchAndOpsGroupPx)
  const searchAndNavMaxWidthPx = 300
  return (
    <Box sx={{
      'display': 'flex',
      'flexDirection': 'row',
      'borderRadius': '5px',
      'width': '400px',
      'padding': '0px 0px 3px 4px',
      'background': theme.palette.primary.background,
      'color': theme.palette.primary.contrastText,
      'textOverflow': 'ellipsis',
      'overflow': 'hidden',
      'whiteSpace': 'nowrap',
      'border': 'none',
      '& a': {
        ...theme.typography.tree,
        color: theme.palette.primary.contrastText,
        fontSize: '12px',
        textDecoration: 'none',
      },
      '@media (max-width: 900px)': {
        width: `${searchAndNavWidthPx}px`,
        maxWidth: `${searchAndNavMaxWidthPx}px`,
      },
    }}
    >
      {/* <Tooltip title={modelPath.org} placement={'bottom'}> */}

      {isLocalModel ?
        <Box
          sx={{
            fontSize: '12px',
          }}
        >
          Local model
        </Box> :
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
          }}
        >
          <Box>
            <a
              href={`https://github.com/${modelPath.org === undefined ? 'bldrs-ai' : modelPath.org}`}
              target='_new'
            >
              {modelPath.org === undefined ? 'bldrs-ai' : modelPath.org} &gt;&nbsp;
            </a>
          </Box>
          <Box
            sx={{
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            <a
              // eslint-disable-next-line max-len
              href={`https://github.com/${modelPath.org === undefined ? 'bldrs-ai' : modelPath.org}/${modelPath.repo === undefined ? 'Share' : modelPath.repo}`}
              target='_new'
            >
              {modelPath.repo === undefined ? 'Share' : modelPath.repo}
            </a>
          </Box>
        </Box>

      }
      {/* </Tooltip> */}
      {/* <Tooltip title={modelPath.repo} placement={'bottom'}> */}

      {/* </Tooltip> */}
      {/* <Tooltip title={modelPath.filepath} placement={'bottom'}>
        <Box
          sx={{
            // maxWidth: '60px',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <a
            href={`https://github.com/${modelPath.org}/${modelPath.repo}/blob/${modelPath.branch}${modelPath.filepath}`}
            target='_new'
          >
            {modelPath.filepath}
          </a>
        </Box>
      </Tooltip> */}
    </Box>
  )
}

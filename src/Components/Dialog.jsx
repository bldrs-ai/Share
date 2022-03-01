import React from 'react'
import CheckIcon from '@mui/icons-material/Check'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'


/**
 * A generic base dialog component.
 * @param {Object} icon Leading icon above header description
 * @param {string} headerText Short message describing the operation
 * @param {function} closeFn
 * @param {Object} Content node
 * @return {Object} React component
 */
export default function Dialog({icon, headerText, closeFn, content}) {
  const classes = useStyles()
  return (
    <div onClick={closeFn} className={classes.root} role='none'>
      <Paper onClick={(event) => event.stopPropagation()} elevation={3}>
        {icon}
        <h1>{headerText}</h1>
        {content}
        <IconButton onClick={closeFn} onKeyDown={closeFn}>
          <CheckIcon/> Done
        </IconButton>
      </Paper>
    </div>)
}


const useStyles = makeStyles({
  root: {
    'position': 'fixed',
    'top': '0px',
    'left': '0px',
    'width': '100vw',
    'height': '100vh',
    'display': 'flex',
    'justifyContent': 'center',
    'backgroundColor': 'rgba(100, 100, 100, 0.5)',
    'zIndex': 3,
    '& svg': {
      width: '30px',
      height: '30px',
      borderRadius: '50%',
    },
    '& .MuiPaper-root': {
      'position': 'relative',
      'textAlign': 'center',
      'top': '10vh',
      'width': '300px',
      'height': '350px',
      'minWidth': '30em',
      'fontFamily': 'Helvetica',
      'padding': '1em',
      '@media (max-width: 900px)': {
        width: '84%',
        height: '400px',
      },
      '& > svg': {
        width: '40px',
        height: '40px',
        marginTop: '20px',
        border: 'solid 0.5px grey',
        borderRadius: '50%',
      },
      '& h1, & h2, & p': {
        'textAlign': 'center',
        'color': '#696969',
        'fontWeight': 200,
        'lineHeight': '19px',
        '@media (max-width: 900px)': {
          lineHeight: '22px',
        },
      },
      '& h1': {
        fontSize: '1.2em',
        margin: '1em',
      },
      '& h2': {
        fontSize: '1.1em',
        margin: '1em',
      },
    },
  },
})

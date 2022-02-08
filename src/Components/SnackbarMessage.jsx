import React from 'react';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';
import { makeStyles } from '@mui/styles';


const Alert = React.forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={1} ref={ref} variant='filled' {...props} />;
});

export default function SnackBarMessage ({ message, type, open }) {
  const classes = useStyles();
  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Alert
        severity={type}
        sx = {{backgroundColor:'#848484'}}
      >
        {message}
      </Alert>
    </Snackbar>
  );
};

const useStyles = makeStyles({
  alert: {
    backgroundColor: '#787878',
    width: 'auto',
    paddingRight: 20,
    textTransform: 'uppercase',
  },
});


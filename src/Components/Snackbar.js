import React from 'react';
import Snackbar from '@mui/material/Snackbar';
import { makeStyles } from '@material-ui/core/styles';
import MuiAlert from '@mui/material/Alert';

const Alert = React.forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={1} ref={ref} variant='filled' {...props} />;
});

const useStyles = makeStyles((theme) => ({
  alert: {
    backgroundColor: '#787878',
    width: 'auto',
    paddingRight: 20,
  },
}));

const SnackBarMessage = ({ message, type, open }) => {
  const classes = useStyles();
  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      autoHideDuration={6000}
    >
      <Alert
        style={{
          backgroundColor: '#787878',
          width: 'auto',
          paddingRight: 20,
        }}
        severity={type}
      >
        {message}
      </Alert>
    </Snackbar>
  );
};

export default SnackBarMessage;

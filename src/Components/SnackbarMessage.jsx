import React from 'react';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';

const Alert = React.forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={1} ref={ref} variant='filled' {...props} />;
});

const SnackBarMessage = ({ message, type, open }) => {
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
          textTransform: 'uppercase',
        }}
        severity={type}
      >
        {message}
      </Alert>
    </Snackbar>
  );
};

export default SnackBarMessage;

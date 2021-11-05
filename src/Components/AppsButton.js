import React from 'react';
import IconButton from '@mui/material/IconButton';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles((theme) => ({
  button: {
    '&&': {
      color: 'WhiteSmoke',
      height: 36,
      width: 32,
      margin: theme.spacing(1),
      display: 'none', // remove this line to display the Apps selector
    },
  },
}));


const AppButton = ({ onClick }) => {
  const classes = useStyles();
  return (
    <IconButton
        aria-label="open apps"
        color='secondary'
        className={classes.button}
        size='medium'
        onClick={onClick}
      >
      <MoreVertIcon />
    </IconButton>
  );
};

export default AppButton;

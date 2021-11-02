import React from 'react';
import IconButton from '@mui/material/IconButton';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles((theme) => ({
  button: {
    height: 36,
    margin: theme.spacing(1),
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

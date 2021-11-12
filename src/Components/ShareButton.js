import React from 'react';
import Button from '@mui/material/Button';
import ShareIcon from '@mui/icons-masterial/Share';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles((theme) => ({
  button: {
    height: 36,
    margin: theme.spacing(1),
  },
}));

const ShareButton = ({ name, onClick }) => {
  const classes = useStyles();
  return (
    <Button
      variant='contained'
      color='secondary'
      className={classes.button}
      startIcon={<ShareIcon />}
      size='medium'
      onClick={onClick}
    >
      {name}
    </Button>
  );
};

export default ShareButton;

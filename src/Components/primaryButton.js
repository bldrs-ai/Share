import React from 'react';
import Button from '@material-ui/core/Button';
import ShareIcon from '@material-ui/icons/Share';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles((theme) => ({
  button: {
    height: 36,
    margin: theme.spacing(1),
  },
}));

const PrimaryButton = ({ name, onClick }) => {
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

export default PrimaryButton;

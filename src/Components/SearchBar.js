import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';
import Divider from '@material-ui/core/Divider';
import InputBase from '@material-ui/core/InputBase';
import IconButton from '@material-ui/core/IconButton';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import DirectionsIcon from '@material-ui/icons/Directions';
import TableChartOutlinedIcon from '@material-ui/icons/TableChartOutlined';

const useStyles = makeStyles((theme) => ({
  root: {
    padding: '2px 4px',
    display: 'flex',
    alignItems: 'center',
    width: 300,
  },
  input: {
    marginLeft: theme.spacing(1),
    flex: 1,
  },
  iconButton: {
    padding: 10,
  },
  divider: {
    height: 28,
    margin: 4,
  },
}));

export default function SearchBar({
  onClickMenu,
  disabled,
  open,
  onClickSearch,
}) {
  const classes = useStyles();

  return (
    <Paper component='form' className={classes.root}>
      <IconButton
        className={classes.iconButton}
        aria-label='menu'
        onClick={onClickMenu}
        disabled={disabled}
      >
        <MenuIcon />
      </IconButton>
      <InputBase
        className={classes.input}
        placeholder='Search IFC'
        inputProps={{ 'aria-label': 'search google maps' }}
      />
      <IconButton
        type='submit'
        className={classes.iconButton}
        aria-label='search'
      >
        <SearchIcon />
      </IconButton>
      <Divider className={classes.divider} orientation='vertical' />
      <IconButton
        color='primary'
        className={classes.iconButton}
        aria-label='directions'
        onClick={onClickSearch}
      >
        <TableChartOutlinedIcon />
      </IconButton>
    </Paper>
  );
}

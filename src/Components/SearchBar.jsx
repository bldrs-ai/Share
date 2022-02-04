import React from 'react';
import { makeStyles } from '@mui/styles';
import Paper from '@mui/material/Paper';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import Search from '../assets/Search.svg';
import TreeIcon from '../assets/Tree.svg';
import TreeIconOn from '../assets/TreeOn.svg';
import Hamburger from '../assets/Hamburger.svg';

const useStyles = makeStyles({
  root: {
    padding: '2px 4px',
    display: 'flex',
    alignItems: 'center',
    width: 300,
    '@media (max-width: 900px)': {
      width: 240,
    },
  },
  input: {
    flex: 1,
  },
  iconButton: {
    padding: 10,
  },
  divider: {
    height: 28,
    margin: 4,
  },
  icon:{
    width: '30px',
    height: '30px'
  },
  inputBase:{
    fontSize: 18,
    fontWeight: 600,
    fontFamily: 'Helvetica',
  }
});

export default function SearchBar({
  onSearch,
  onSearchModify,
  onClickMenu,
  disabled,
  open,
}) {
  const classes = useStyles();
  const [textValue, setTextValue] = React.useState('');

  // TODO(pablo): What I have here seems to work fine but not sure if
  // it's idomatic.  See:
  //   https://blog.logrocket.com/using-material-ui-with-react-hook-form/
  const onChange = (event) => {
    const value = event.target.value;
    setTextValue(value);
    onSearchModify(value);
  };

  const onSubmit = (event) => {
    event.preventDefault();
    onSearch(textValue);
    // TODO(pablo): hack
    document.getElementById('main_search_input').blur();
  };

  return (
    <Paper component='form' className={classes.root} onSubmit={onSubmit}>
      <IconButton
        className={classes.iconButton}
        aria-label='menu'
        onClick={onClickMenu}
        disabled={disabled}
      >
        <Hamburger className={classes.icon} />
      </IconButton>
      <InputBase
        sx={{ ml: 1, flex: 1 }}
        id='main_search_input'
        placeholder='Search building'
        inputProps={{ 'aria-label': 'search' }}
        onChange={onChange}
        value={textValue}
        style={{
          fontSize: 18,
          fontWeight: 200,
          fontFamily: 'Helvetica',
        }}/>
      <IconButton
        type='submit'
        className={classes.iconButton}
        aria-label='search'
      >
        <Search className={classes.icon} />
      </IconButton>
    </Paper>
  );
}

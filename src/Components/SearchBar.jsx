import React, {useEffect, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import InputBase from '@mui/material/InputBase'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import Hamburger from '../assets/3D/tree.svg'
import Search from '../assets/3D/search.svg'


/**
 * @param {function} onSearch
 * @param {function} onSearchModify
 * @param {function} onClickMenu
 * @param {boolean} open
 * @return {Object}
 */
export default function SearchBar({onClickMenu, open}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [inputText, setInputText] = useState('')
  const classes = useStyles()


  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    console.log('SearchBar#useEffect[]: URLSearchParams: ', sp)
    let query = sp.get('q')
    if (query) {
      setInputText(query.trim())
    }
  }, [])

  // TODO(pablo): What I have here seems to work fine but not sure if
  // it's idomatic.  See:
  //   https://blog.logrocket.com/using-material-ui-with-react-hook-form/
  const onChange = (event) => {
    const value = event.target.value
    setInputText(value)
    // TODO: onSearchModify(value)
  }

  const onSubmit = (event) => {
    event.preventDefault()
    setSearchParams({q: inputText })
    // TODO(pablo): hack
    document.getElementById('main_search_input').blur()
  }

  return (
    <Paper component='form' className={classes.root} onSubmit={onSubmit}>
      <IconButton
        className={classes.iconButton}
        aria-label='menu'
        onClick={onClickMenu}
      >
        <Hamburger className = {classes.icon}/>
      </IconButton>
      <InputBase
        sx={{ml: 1, flex: 1}}
        id='main_search_input'
        placeholder='Search building'
        inputProps={{'aria-label': 'search'}}
        onChange={onChange}
        value={inputText}
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
  )
}

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
    color: '#696969',
  }
})

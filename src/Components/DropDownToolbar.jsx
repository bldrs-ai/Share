import * as React from 'react';
import { styled } from '@mui/material/styles';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import NativeSelect from '@mui/material/NativeSelect';
import InputBase from '@mui/material/InputBase';

const BootstrapInput = styled(InputBase)(({ theme }) => ({
  'label + &': {
    marginTop: 0,
  },
  '& .MuiInputBase-input': {
    borderRadius: 4,
    position: 'relative',
    width:'74px',
    border: '1px solid #848484',
    fontSize: 16,
    color:'#848484',
    padding: '10px 26px 10px 12px',
    transition: theme.transitions.create(['border-color', 'box-shadow']),
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"',
    ].join(','),
    '&:focus': {
      borderRadius: 4,
      borderColor: '#848484',
      boxShadow: '0 0 0 0.2rem rgba(0,123,255,.25)',
    },
    '@media (max-width: 900px)': {
          display:'none',
        },
  },
}));

export default function MultipleSelect() {
  const [age, setAge] = React.useState('');
  const handleChange = (event) => {
    setAge(event.target.value);
  };
  return (
    <div>
      <FormControl sx={{ m: 1 }} variant="standard">
        {/* <InputLabel htmlFor="demo-customized-select-native">Models</InputLabel> */}
        <NativeSelect
          id="demo-customized-select-native"
          value={age}
          onChange={handleChange}
          input={<BootstrapInput />}
        >
          <option value={10}>model 1</option>
          <option value={20}>model 2</option>
          <option value={30}>model 3</option>
        </NativeSelect>
      </FormControl>
    </div>
  );
}

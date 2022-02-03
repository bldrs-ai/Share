import React from 'react';
import Switch from '@mui/material/Switch';
import { alpha, styled } from '@mui/material/styles';
import { grey } from '@mui/material/colors';

const Toggle = styled(Switch)(({ theme }) => ({
  '& .MuiSwitch-switchBase.Mui-checked': {
    color: grey[600],
    '&:hover': {
      backgroundColor: alpha(grey[600]),
    },
  },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
    backgroundColor: grey[600],
  },
}));

export default Toggle;

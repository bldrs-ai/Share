import React, {useState,useMemo,createContext} from 'react';
import CadView from './Containers/CadView';
import { ThemeProvider, createTheme } from '@mui/material/styles';


const ColorModeContext = createContext({ toggleColorMode: () => {} });

function ToggleColorMode() {
  const [mode, setMode] =useState('light');
console.log('in the toggle mode')
  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
      },
    }),
    [],
  );
}


export default function App() {
  const [mode, setMode] = React.useState('dark');
  const colorMode = React.useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
      },
    }),
    [],
  );
  const theme = React.useMemo(
    () =>{
return(
 createTheme({
        palette: {
          mode,
          primary: {
                main: "#C8C8C8",
                light:'#e3f2fd',
                dark:'#42a5f5'
              },
          background:{
          paper: mode === 'light'?"#DCDCDC":'#252525'
          },
        tonalOffset: 1,
        },
        // typography: {
        //   allVariants: {
        //     color: ""
        //   },
        // },
      })
)

}
     ,
    [mode],
  );

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CadView toggleTheme = {colorMode.toggleColorMode} mode = {mode}/>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

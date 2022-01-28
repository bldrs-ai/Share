import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { render } from 'react-dom'
import App from './App';

// TODO: This isn't used.
// If icons-material isn't imported somewhere, mui dies
import AccountCircle from '@mui/icons-material/AccountCircle';

console.log('IN APP LOC 1: ', window.location)

function Routed() {
/*
  const navigate = useNavigate();

  React.useEffect(() => {
    const referrer = document.referrer;
    if (referrer) {
      const path = new URL(document.referrer).pathname;
      if (path.length > 1) {
        navigate(path);
      }
    }
  }, []);
*/
  console.log('IN APP LOC: ', window.location)
  return (
    <Routes>
      <Route path="/*" element={<App/>} />
    </Routes>
  );
}

render(
  <BrowserRouter>
    <Routed/>
  </BrowserRouter>, document.getElementById('root'))

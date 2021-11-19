import React from 'react';
import { BrowserRouter, Routes, Route, Link, Outlet, useNavigate, useRoutes } from 'react-router-dom';
import { render } from 'react-dom'
import App from './App';


function Routed() {
  const nav = useNavigate();

  React.useEffect(() => {
    const referrer = document.referrer;
    if (referrer) {
      console.log('Referrer: ', document.referrer);
      const path = new URL(document.referrer).pathname;
      console.log('Referrer: path: ', path);
      if (path.length > 1) {
        nav(path);
      }
    }
  }, []);

  let element = useRoutes([
    { path: "/*", element: <App /> },
  ]);
  return element;
}

render(
  <BrowserRouter>
    <Routed/>
  </BrowserRouter>, document.getElementById('root'))

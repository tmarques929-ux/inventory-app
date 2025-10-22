import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { NotificationProvider } from './context/NotificationContext';

// The main entry point mounts the App component into the HTML page.
// BrowserRouter enables declarative routing throughout the app.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotificationProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </NotificationProvider>
  </React.StrictMode>,
);

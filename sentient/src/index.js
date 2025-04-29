import React from 'react';
import { createRoot } from 'react-dom/client';  // Updated import
import App from './App';
import { AuthProvider } from './AuthContext';
import './index.css';
import reportWebVitals from './reportWebVitals';

// Get the root element
const container = document.getElementById('root');

// Create a root
const root = createRoot(container);

// Render your app
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

reportWebVitals();
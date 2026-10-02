import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setupUpdates } from './pwa';
import './style.css';

setupUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

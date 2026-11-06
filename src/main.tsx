import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/tv.css';
import { initTvMode } from './lib/tvmode.ts';

initTvMode();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

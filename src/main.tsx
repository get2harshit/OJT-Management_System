import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { BrowserRouter } from 'react-router-dom';

// StrictMode is applied inside App.tsx, per-route, rather than wrapped around
// everything here — see the comment on the /live-session route for why.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

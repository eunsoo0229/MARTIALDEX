import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';

// Ground Battle (그라운드 배틀) was removed — drop its leftover local state so
// it no longer rides along in cloud backups / "local data to back up" checks.
// Past training-history entries it wrote are user records and are kept.
try {
  window.localStorage.removeItem('martialdex:ground-battle-matches');
  window.localStorage.removeItem('martialdex:ground-battle-run');
} catch {
  // localStorage unavailable — nothing to clean up.
}


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
  });
});

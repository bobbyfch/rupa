import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import './rupa-refinements.css';
import './rupa-design.css';
import 'yet-another-react-lightbox/styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const script = new URL('sw.js', new URL(import.meta.env.BASE_URL, window.location.origin));
    void navigator.serviceWorker.register(script, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  }, { once: true });
}

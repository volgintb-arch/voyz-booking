import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPlatform } from './platform';
import { rememberVisit } from './share/links';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import './styles/global.css';

const platform = initPlatform();
// Link source and widget mode come in the URL of the very first screen.
rememberVisit(new URLSearchParams(window.location.hash.split('?')[1] ?? ''));

// Service worker only on the web: the native shell already ships the files.
if (platform === 'web' || platform === 'telegram') {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

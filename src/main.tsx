import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/special-elite/400.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';
import './styles/global.css';
import { App } from './App';
import { startMusic } from './audio/music';
import { unlockAudio } from './audio/sfx';

// Audio may only start after a user gesture. The soundtrack retries on each gesture until it plays.
const unlock = () => {
  unlockAudio();
  startMusic();
};
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

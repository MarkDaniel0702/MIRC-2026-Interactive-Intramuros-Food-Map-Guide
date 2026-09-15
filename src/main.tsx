import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Leaflet's own CSS must load before styles.css, which overrides .leaflet-*
// selectors (e.g. the navy tile-pane filter) -- same order as index.html's old
// <link> tags.
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './styles.css';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

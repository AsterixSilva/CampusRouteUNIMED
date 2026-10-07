import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import { createCampusRoute } from './campusroute/index.js';
import { destroyScopeMask } from './scopeMask.js';
import './campusroute/clean.css';

// Apply CampusRoute presentation before the underlying app begins asynchronous
// startup, preventing the original cockpit UI/scope from flashing on first load.
document.documentElement.classList.add('campusroute-boot');
document.body.classList.add('campusroute-clean');

const application = createStandaloneApplication({
  googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
  allowQaRegistration: import.meta.env.DEV,
});

application.start().then(async ({ scene }) => {
  // CampusRoute is a focused campus-navigation experience. Keep the underlying
  // 3D renderer, while disabling unrelated presentation layers.
  try {
    await window.__campusRoute?.dataManager?.clearSelectedLayers({
      origin: 'campusroute-clean-start',
    });
  } catch (error) {
    console.warn('[CampusRoute] Could not clear optional data layers:', error);
  }
  destroyScopeMask();
  document.body.classList.add('campusroute-clean');
  window.__CAMPUSROUTE__ = createCampusRoute({ viewer: scene.viewer });
}).catch((error) => {

  console.error("CampusRoute UNIMED initialization failed:", error);
  const loaderStatus = document.querySelector('#loading-screen .loader-status');
  loaderStatus.textContent = `Error: ${describeError(error)}`;
  loaderStatus.style.color = '#ff4444';
});

export { application };

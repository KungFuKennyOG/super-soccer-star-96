// WebXR session helpers shared by every page. Same session settings the games use today.

export const SESSION_INIT = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };

// true when an immersive VR session can start in this browser
export async function vrSupported() {
  try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); }
  catch (e) { return false; }
}

// Starts VR on a renderer with xr.enabled = true. Resolves with the XRSession; rejects if the browser refuses.
export async function enterVR(renderer, { foveation = 1 } = {}) {
  const session = await navigator.xr.requestSession('immersive-vr', SESSION_INIT);
  renderer.xr.setReferenceSpaceType('local-floor');
  await renderer.xr.setSession(session);
  try { renderer.xr.setFoveation(foveation); } catch (e) {}
  return session;
}

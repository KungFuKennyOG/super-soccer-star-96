// The renderer, scene, camera and player rig every page starts from.
import * as THREE from 'three';

// canvas: the page's <canvas>. far: camera draw distance (arena 90 m, Showdowns 160 m).
// The rig is the player's body in the world: move and turn it, never the camera (the headset owns the camera in VR).
/**
 * @param {{ canvas: HTMLCanvasElement, fov?: number, near?: number, far?: number, antialias?: boolean }} opts
 */
export function createStage({ canvas, fov = 72, near = 0.05, far = 90, antialias = true }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.xr.enabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, near, far);
  camera.rotation.order = 'YXZ'; // yaw then pitch, for desktop mouse look
  camera.position.set(0, 1.6, 0);
  const rig = new THREE.Group(); rig.add(camera); scene.add(rig);

  // the headset sets its own size; only the browser window resizes the canvas
  addEventListener('resize', () => {
    if (renderer.xr.isPresenting) return;
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  });

  return { renderer, scene, camera, rig };
}

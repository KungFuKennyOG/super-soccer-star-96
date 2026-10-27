// ESLint flat config with no plugin packages, so `npm install` stays small.
// Rules are the bug-catching part of eslint:recommended; style is left alone.
// If no-undef flags a real browser global, add it to the matching list below.

const browser = Object.fromEntries([
  'window', 'self', 'globalThis', 'document', 'navigator', 'location', 'history', 'console', 'performance',
  'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'devicePixelRatio', 'innerWidth', 'innerHeight', 'matchMedia', 'getComputedStyle',
  'fetch', 'URL', 'URLSearchParams', 'Request', 'Response', 'Headers', 'caches', 'localStorage', 'sessionStorage', 'structuredClone',
  'AudioContext', 'OfflineAudioContext', 'Image', 'ImageData', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'crypto',
  'Event', 'CustomEvent', 'EventTarget', 'AbortController', 'WebSocket', 'RTCPeerConnection', 'RTCSessionDescription', 'MediaStream',
  'Worker', 'MessageChannel', 'BroadcastChannel', 'ResizeObserver', 'IntersectionObserver', 'OffscreenCanvas',
  'HTMLElement', 'HTMLCanvasElement', 'HTMLButtonElement', 'HTMLInputElement', 'XRSession', 'XRWebGLLayer',
].map(name => [name, 'readonly']));

const worker = Object.fromEntries([
  'self', 'globalThis', 'caches', 'clients', 'fetch', 'URL', 'Request', 'Response', 'Headers', 'console', 'registration', 'skipWaiting',
].map(name => [name, 'readonly']));

const node = Object.fromEntries([
  'process', 'console', 'globalThis', 'URL', 'Buffer', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'structuredClone',
].map(name => [name, 'readonly']));

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'no-const-assign': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-class-members': 'error',
  'no-duplicate-case': 'error',
  'no-redeclare': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'no-sparse-arrays': 'error',
  'no-fallthrough': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-constant-condition': ['warn', { checkLoops: false }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-debugger': 'error',
  'no-async-promise-executor': 'error',
  'getter-return': 'error',
  'for-direction': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
};

export default [
  { ignores: ['node_modules/**', 'tests/smoke/out/**'] },
  { files: ['**/*.js', '**/*.mjs'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browser }, rules },
  { files: ['sw.js'], languageOptions: { sourceType: 'script', globals: worker } },
  { files: ['tests/**', 'tools/**', 'eslint.config.js'], languageOptions: { globals: { ...browser, ...node } } },
];

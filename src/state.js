export const DEFAULT_STATE = Object.freeze({ scene: 0, palette: 0, speed: 0.65, intensity: 0.55, seed: 72491, paused: false });
export const SCENES = Object.freeze([
  { name: 'Nebula', subtitle: 'A thousand paths. One gravity.', description: 'A spiral of light, slowly finding its center.' },
  { name: 'Bloom', subtitle: 'Geometry, growing wild.', description: 'An impossible flower woven from moving light.' },
  { name: 'Tidal', subtitle: 'Somewhere between sea and sky.', description: 'A luminous current with a rhythm of its own.' },
]);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export function normalizeState(value = {}) {
  const finite = (key, min, max, integer = false) => {
    const n = typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] : DEFAULT_STATE[key];
    return integer ? Math.round(clamp(n, min, max)) : clamp(n, min, max);
  };
  return {
    scene: finite('scene', 0, 2, true), palette: finite('palette', 0, 2, true),
    speed: finite('speed', 0.25, 1.5), intensity: finite('intensity', 0, 1),
    seed: finite('seed', 1, 4294967295, true), paused: value.paused === true,
  };
}
export function parseScene(hash) {
  if (typeof hash !== 'string' || hash.length > 512) return { ...DEFAULT_STATE };
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('v') !== '1') return { ...DEFAULT_STATE };
  const values = {};
  for (const key of ['scene', 'palette', 'speed', 'intensity', 'seed']) {
    const raw = params.get(key);
    if (raw !== null && raw.trim() !== '') values[key] = Number(raw);
  }
  return normalizeState(values);
}
export function serializeScene(state) {
  const clean = normalizeState(state);
  const params = new URLSearchParams({ v: '1', scene: clean.scene, palette: clean.palette, speed: clean.speed.toFixed(2), intensity: clean.intensity.toFixed(2), seed: clean.seed });
  return `#${params}`;
}
export function newSeed() {
  return (crypto.getRandomValues(new Uint32Array(1))[0] || 1);
}
